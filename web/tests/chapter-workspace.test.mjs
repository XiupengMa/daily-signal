import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {chapterAt, chapterScripts, formatTime, languagePosition, workspaceChapters} from '../lib/chapter-workspace.ts';
const edition = JSON.parse(await readFile(new URL('../examples/edition.json', import.meta.url), 'utf8'));

test('each chapter is selectable at its own language timestamp', () => {
  assert.deepEqual(workspaceChapters(edition), edition.chapters);
  for (const lang of ['en','zh']) for (const chapter of edition.chapters)
    assert.equal(chapterAt(edition.chapters, lang, chapter.start[lang]).id, chapter.id);
});
test('language switching restarts the corresponding topic', () => {
  assert.equal(languagePosition(edition.chapters, 'en', 'zh', 210), 210);
  assert.equal(languagePosition(edition.chapters, 'zh', 'en', 400), 375);
  assert.equal(languagePosition(edition.chapters, 'en', 'zh', 0), 0);
});
test('explicit chapter scripts preserve the entire narration verbatim', () => {
  for (const lang of ['en','zh']) {
    const scripts = chapterScripts(edition, lang);
    assert.equal(Object.keys(scripts).length, 5);
    assert.equal(edition.chapters.map(c => scripts[c.id]).join('\n\n'), edition.narration[lang]);
  }
});
test('unknown legacy boundaries use full narration rather than guessed excerpts', () => {
  const changed=structuredClone(edition);
  changed.chapters.forEach(c=>delete c.script);
  changed.narration.en='A transcript without recognized chapter headings.';
  assert.deepEqual(chapterScripts(changed, 'en'), {});
});
test('incomplete archives retain every story without inventing timestamps', () => {
  const old=structuredClone(edition);delete old.chapters;delete old.narration;
  const chapters=workspaceChapters(old);
  assert.equal(chapters.length,4);
  assert.ok(chapters.every(c=>c.start===undefined));
  assert.deepEqual(chapterScripts(old,'en'),{});
  old.chapters=[edition.chapters[0],edition.chapters[2]];
  assert.equal(workspaceChapters(old).filter(c=>c.storyId).length,3);
});
test('time display handles invalid values and long episodes', () => {
  assert.equal(formatTime(236.855),'03:56');assert.equal(formatTime(1357),'22:37');
  assert.equal(formatTime(NaN),'00:00');assert.equal(formatTime(-4),'00:00');
});
test('legacy closing headings do not swallow repeated numbered takeaways', () => {
  const changed=structuredClone(edition);
  changed.chapters=[changed.chapters[0],changed.chapters[1],changed.chapters[2],changed.chapters.at(-1)];
  changed.chapters.forEach(c=>delete c.script);
  changed.narration.en='Intro.\n\nFirst, first story.\n\nSecond, second story.\n\nClosing takeaways.\n\nFirst, remember this.';
  changed.narration.zh='开场\n\n第一部分：第一个话题\n\n第二部分：第二个话题\n\n结束与实用总结\n\n第一点，记住它。';
  for(const lang of ['en','zh']) {
    const scripts=chapterScripts(changed,lang);
    assert.equal(Object.keys(scripts).length,4);
    assert.equal(changed.chapters.map(c=>scripts[c.id]).join('\n\n'),changed.narration[lang]);
  }
});
