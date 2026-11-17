import type { Edition } from './edition';

export type Language = 'en' | 'zh';
export type WorkspaceChapter = {
  id: string; title: string; titleZh: string; storyId?: string;
  start?: {en: number; zh: number};
};

export function workspaceChapters(edition: Edition): WorkspaceChapter[] {
  const chapters: WorkspaceChapter[] = [...(edition.chapters || [])];
  // Older editions remain fully readable even when they have no timing map.
  if (!chapters.length) chapters.push({id: 'overview', title: 'Overview', titleZh: '本期概览'});
  for (const story of edition.items) {
    if (!chapters.some(chapter => chapter.storyId === story.id)) {
      chapters.push({id: `untimed-${story.id}`, storyId: story.id, title: story.title, titleZh: story.titleZh});
    }
  }
  return chapters;
}

export function chapterAt(chapters: WorkspaceChapter[], language: Language, seconds: number) {
  return [...chapters].reverse().find(chapter => chapter.start && chapter.start[language] <= seconds + .05);
}

export function languagePosition(chapters: WorkspaceChapter[], from: Language, to: Language, seconds: number) {
  return chapterAt(chapters, from, seconds)?.start?.[to] ?? 0;
}

export function formatTime(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${Math.floor(safe % 60).toString().padStart(2, '0')}`;
}

/** Extract only verbatim sections with complete, ordered chapter boundaries.
 * If a later edition uses a different writing format, show its full script instead
 * of guessing transcript boundaries from timing or word counts. No API changes.
 */
export function chapterScripts(edition: Edition, language: Language): Record<string, string> {
  const text = edition.narration?.[language];
  const chapters = edition.chapters;
  if (!text || !chapters?.length) return {};
  if (chapters.every(c => c.script?.[language])) return Object.fromEntries(chapters.map(c => [c.id, c.script![language]]));
  const paragraphs = text.split(/\n\s*\n/);
  const stories = chapters.filter(chapter => chapter.storyId);
  const en = ['First','Second','Third','Fourth','Fifth','Sixth','Seventh','Eighth','Ninth','Tenth'];
  const zh = ['一','二','三','四','五','六','七','八','九','十'];
  if (!stories.length || stories.length > en.length) return {};
  const boundaries: number[] = [];
  for (let i = 0; i < stories.length; i++) {
    const pattern = language === 'en' ? new RegExp(`^${en[i]}[,.:]`, 'i') : new RegExp(`^第${zh[i]}(?:条|部分)[，,:：]`);
    const index = paragraphs.findIndex((p, j) => j > (boundaries.at(-1) ?? -1) && pattern.test(p.trim()));
    if (index < 0) return {};
    boundaries.push(index);
  }
  const last = boundaries.at(-1)!;
  const closingPattern = language === 'en' ? /^(Before we finish|To (wrap up|close)|Finally[,.:]|In closing|Closing takeaways[.:])/i : /^(最后[，,:：]|结束之前|总结一下|结束与实用总结$)/;
  const closing = paragraphs.findIndex((p, i) => i > last && closingPattern.test(p.trim()));
  // Without a closing boundary the final story cannot be safely isolated.
  if (closing < 0) return {};
  const result: Record<string, string> = {};
  stories.forEach((chapter, i) => { result[chapter.id] = paragraphs.slice(boundaries[i], boundaries[i + 1] ?? closing).join('\n\n'); });
  const firstStoryIndex = chapters.findIndex(c => c.storyId);
  const lastStoryIndex = chapters.findLastIndex(c => c.storyId);
  if (firstStoryIndex === 1) result[chapters[0].id] = paragraphs.slice(0, boundaries[0]).join('\n\n');
  if (lastStoryIndex === chapters.length - 2) result[chapters.at(-1)!.id] = paragraphs.slice(closing).join('\n\n');
  return result;
}
