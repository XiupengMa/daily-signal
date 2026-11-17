'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import type {CSSProperties, KeyboardEvent, SyntheticEvent} from 'react';
import {ArrowLeft, ArrowUpRight, AudioLines, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Download, FileText, Headphones, List, Pause, Play, Search, Video, X} from 'lucide-react';
import type {Edition} from '@/lib/edition';
import {chapterAt, chapterScripts, formatTime, languagePosition, workspaceChapters} from '@/lib/chapter-workspace';
import type {Language, WorkspaceChapter} from '@/lib/chapter-workspace';

type ContentTab = 'summary' | 'script' | 'sources';
const dateLabel = (date: string, language: Language = 'en', short = false) => new Date(date + 'T12:00:00Z').toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {month: short ? 'short' : 'long', day: 'numeric', ...(short ? {} : {year: 'numeric'}), timeZone: 'UTC'});
const mediaUrl = (key?: string) => key ? '/api/media/' + key : undefined;
const chapterTitle = (chapter: WorkspaceChapter | undefined, language: Language) => chapter ? (language === 'zh' ? chapter.titleZh : chapter.title) : '';

export default function Home() {
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState('');
  const [edition, setEdition] = useState<Edition | null>(null);
  const [language, setLanguage] = useState<Language>('en');
  const [mode, setMode] = useState<'audio' | 'video'>('audio');
  const [speed, setSpeed] = useState(1);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [mediaError, setMediaError] = useState(false);
  const [playNotice, setPlayNotice] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [tab, setTab] = useState<ContentTab>('summary');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const resumePlayback = useRef(false);
  const chinese = language === 'zh';
  const chapters = useMemo(() => edition ? workspaceChapters(edition) : [], [edition]);
  const scripts = useMemo(() => edition ? chapterScripts(edition, language) : {}, [edition, language]);
  const selected = chapters.find(c => c.id === selectedId) || chapters[0];
  const selectedIndex = chapters.findIndex(c => c.id === selected?.id);
  const storyIndex = edition?.items.findIndex(s => s.id === selected?.storyId) ?? -1;
  const story = storyIndex >= 0 ? edition?.items[storyIndex] : undefined;
  const currentChapter = chapterAt(chapters, language, currentTime);
  const track = edition?.media[language];
  const mediaSource = mode === 'audio' ? track?.audio : track?.video;
  const narration = edition?.narration?.[language];
  const selectedScript = selected ? scripts[selected.id] : undefined;
  const duration = track?.duration || 0;
  const isClosing = !!selected && !selected.storyId && selectedIndex === chapters.length - 1 && selectedIndex > 0;
  const filteredChapters = chapters.filter(c => {
    const item = edition?.items.find(s => s.id === c.storyId);
    return [c.title, c.titleZh, item?.summary, item?.summaryZh, item?.category].join(' ').toLowerCase().includes(query.trim().toLowerCase());
  });
  const storyLabel = storyIndex >= 0 ? (chinese ? `动态 ${storyIndex + 1} / ${edition?.items.length}` : `STORY ${storyIndex + 1} OF ${edition?.items.length}`) : (chinese ? '本期简报' : 'THE BRIEFING');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/editions', {signal: controller.signal}).then(r => {if (!r.ok) throw Error(); return r.json() as Promise<{dates: string[]}>;}).then(data => {
      setDates(data.dates);
      const requested = new URLSearchParams(location.search).get('date') || '';
      setDate(data.dates.includes(requested) ? requested : data.dates[0] || '');
      if (!data.dates.length) setLoading(false);
    }).catch(e => {if (e.name !== 'AbortError') {setError('The archive could not be loaded. Please refresh to try again.'); setLoading(false);}});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    mediaRef.current?.pause();
    pendingSeek.current = null;
    resumePlayback.current = false;
    setPlaying(false); setCurrentTime(0); setLoading(true); setMediaError(false); setPlayNotice(false); setError(''); setQuery(''); setMobileDetail(false); setTab('summary');
    fetch('/api/editions?date=' + date, {signal: controller.signal}).then(r => {if (!r.ok) throw Error(); return r.json() as Promise<Edition>;}).then(data => {
      setEdition(data); setSelectedId(workspaceChapters(data)[0]?.id || ''); setLoading(false);
      history.replaceState(null, '', '?date=' + date);
    }).catch(e => {if (e.name !== 'AbortError') {setError('This edition could not be loaded. Please try again.'); setLoading(false);}});
    return () => controller.abort();
  }, [date]);

  useEffect(() => {if (mediaRef.current) mediaRef.current.playbackRate = speed;}, [speed]);

  function updateTime(seconds: number) {
    setCurrentTime(seconds);
    const chapter = chapterAt(chapters, language, seconds);
    if (chapter) setSelectedId(chapter.id);
  }

  function seek(seconds: number) {
    const target = Math.max(0, Math.min(seconds, Math.max(0, duration - .01)));
    pendingSeek.current = target;
    updateTime(target);
    if (mediaRef.current && mediaRef.current.readyState >= 1) {
      mediaRef.current.currentTime = target;
      pendingSeek.current = null;
    }
  }

  function selectChapter(chapter: WorkspaceChapter) {
    if (chapter.start) seek(chapter.start[language]);
    setSelectedId(chapter.id); setMobileDetail(true);
    // Keep desktop chapter context visible; on a phone the detail is a new view.
    if (window.matchMedia('(max-width: 760px)').matches) window.scrollTo({top: 0, behavior: 'instant'});
  }

  function switchMedia(nextMode: 'audio' | 'video', nextLanguage: Language) {
    if (mode === nextMode && language === nextLanguage) return;
    const media = mediaRef.current;
    const now = pendingSeek.current ?? media?.currentTime ?? currentTime;
    const target = nextLanguage === language ? now : languagePosition(chapters, language, nextLanguage, now);
    resumePlayback.current = resumePlayback.current || (!!media && !media.paused && !media.ended);
    media?.pause();
    pendingSeek.current = target;
    setCurrentTime(target); setPlaying(false); setMediaError(false); setPlayNotice(false);
    setMode(nextMode); setLanguage(nextLanguage);
    if (nextMode === 'video' && window.matchMedia('(max-width: 760px)').matches) {setMobileDetail(true); window.scrollTo({top: 0, behavior: 'instant'});}
  }

  function mediaReady(event: SyntheticEvent<HTMLMediaElement>) {
    const media = event.currentTarget;
    media.playbackRate = speed;
    if (pendingSeek.current !== null) {
      const seconds = Math.min(pendingSeek.current, Number.isFinite(media.duration) ? Math.max(0, media.duration - .01) : duration);
      media.currentTime = seconds;
      setCurrentTime(seconds);
      pendingSeek.current = null;
    }
    if (resumePlayback.current) {
      resumePlayback.current = false;
      void media.play().catch(() => setPlayNotice(true));
    }
  }

  function togglePlayback() {
    const media = mediaRef.current;
    if (!media) return;
    setPlayNotice(false);
    if (media.paused) void media.play().catch(() => setPlayNotice(true));
    else media.pause();
  }

  function downloadScript() {
    if (!narration || !edition) return;
    const url = URL.createObjectURL(new Blob([narration], {type: 'text/plain;charset=utf-8'}));
    const a = document.createElement('a'); a.href = url; a.download = `daily-signal-${edition.date}-${language}-script.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function tabKey(event: KeyboardEvent<HTMLButtonElement>, current: ContentTab) {
    const names: ContentTab[] = ['summary', 'script', 'sources'];
    let index = names.indexOf(current);
    if (event.key === 'ArrowRight') index = (index + 1) % 3;
    else if (event.key === 'ArrowLeft') index = (index + 2) % 3;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = 2;
    else return;
    event.preventDefault(); setTab(names[index]); document.getElementById('tab-' + names[index])?.focus();
  }

  const mediaEvents = {
    onLoadedMetadata: mediaReady,
    onTimeUpdate: (event: SyntheticEvent<HTMLMediaElement>) => updateTime(event.currentTarget.currentTime),
    onSeeked: (event: SyntheticEvent<HTMLMediaElement>) => updateTime(event.currentTarget.currentTime),
    onPlay: () => {setPlaying(true); setPlayNotice(false);},
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onError: () => {setMediaError(true); setPlaying(false); resumePlayback.current = false;},
  };
  const sourceItems = story ? [story] : edition?.items || [];
  const sourceCount = sourceItems.reduce((count, item) => count + item.sources.length, 0);

  return <main className={mobileDetail ? 'site detail-view' : 'site'}>
    <a className="skip-link" href="#workspace">{chinese ? '跳到章节' : 'Skip to chapters'}</a>
    <header className="topbar">
      <a className="brand" href="/" aria-label="Daily Signal home"><AudioLines size={27} strokeWidth={2.3}/><span>Daily Signal</span></a>
      <div className="header-actions"><span className="private"><AudioLines size={13}/>{chinese ? '每日简报' : 'Daily briefing'}</span><button className="archive-toggle" aria-expanded={archiveOpen} aria-controls="archive" onClick={() => setArchiveOpen(!archiveOpen)}><CalendarDays size={16}/>{chinese ? '历史简报' : 'Archive'}<ChevronDown size={14} className={archiveOpen ? 'rotated' : ''}/></button></div>
    </header>
    {archiveOpen && <section className="archive" id="archive" aria-label="Briefing archive"><div className="archive-heading"><div><span className="eyebrow">{chinese ? '每一天，都在这里' : 'ONE DAY AT A TIME'}</span><h2>{chinese ? '简报档案' : 'The archive'} <small>{dates.length}</small></h2></div><button className="icon-button" aria-label="Close archive" onClick={() => setArchiveOpen(false)}><X size={20}/></button></div><div className="date-list">{dates.map((d, i) => <button key={d} className={d === date ? 'date-button selected' : 'date-button'} aria-pressed={d === date} onClick={() => {setDate(d); setArchiveOpen(false);}}><CalendarDays size={20}/><span><strong>{dateLabel(d, language)}</strong><small>{i === 0 ? (chinese ? '最新一期' : 'Latest edition') : (chinese ? '每日简报' : 'Daily edition')}</small></span><ChevronRight size={17}/></button>)}</div><p>{chinese ? '历史简报、完整文稿和原始来源，随时回看。' : 'Revisit past briefings, complete scripts, and original sources.'}</p></section>}

    {error ? <section className="empty" role="alert"><h1>Something interrupted the signal.</h1><p>{error}</p><button className="primary-button" onClick={() => location.reload()}>Try again</button></section> : loading ? <section className="empty" role="status"><AudioLines size={32}/><p>Loading your briefing…</p></section> : !edition ? <section className="empty"><h1>The first edition is on its way.</h1><p>Published briefings will appear here.</p></section> : <>
      <section className="edition-header">
        <div className="edition-heading"><div><div className="eyebrow">AI · TECHNOLOGY · SOFTWARE</div><h1>{chinese ? `${dateLabel(edition.date, language, true)}简报` : `${dateLabel(edition.date, language).replace(/, \d{4}$/, '')} briefing`}</h1><p className="edition-theme" lang={chinese ? 'zh-CN' : 'en'}>{chinese ? edition.titleZh : edition.title}</p></div><div className="language-switch" role="group" aria-label="Edition language"><button aria-pressed={!chinese} className={!chinese ? 'active' : ''} onClick={() => switchMedia(mode, 'en')}>English</button><button aria-pressed={chinese} className={chinese ? 'active' : ''} onClick={() => switchMedia(mode, 'zh')}>中文</button></div></div>
        <div className="edition-controls"><div className="mode-switch" role="group" aria-label="Media format"><button aria-pressed={mode === 'audio'} className={mode === 'audio' ? 'active' : ''} onClick={() => switchMedia('audio', language)}><Headphones size={16}/>{chinese ? '收听' : 'Listen'}</button><button aria-pressed={mode === 'video'} className={mode === 'video' ? 'active' : ''} onClick={() => switchMedia('video', language)}><Video size={16}/>{chinese ? '观看' : 'Watch'}</button></div><span className="edition-meta">{chinese ? '中文' : 'English'} <i>·</i> {formatTime(duration)} <i>·</i> {edition.items.length} {chinese ? '条动态' : 'stories'}</span><span className="news-window">{chinese ? '新闻日期' : 'News from'} {dateLabel(edition.newsDate, language, true)} · Pacific</span></div>
      </section>
      <div className="mobile-detail-header"><button onClick={() => {setMobileDetail(false); window.scrollTo({top: 0, behavior: 'instant'});}}><ArrowLeft size={17}/>{chinese ? '全部章节' : 'All chapters'}</button><span>{dateLabel(edition.date, language, true)}</span></div>
      <section className="workspace" id="workspace" aria-label="Chapter workspace">
        <aside className="chapter-sidebar"><div className="chapter-heading"><h2>{chinese ? '章节' : 'Chapters'}</h2><span>{chapters.length}</span></div><label className="chapter-search"><Search size={15}/><input aria-label={chinese ? '搜索章节' : 'Search chapters'} placeholder={chinese ? '查找话题' : 'Find a topic'} value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={14}/></button>}</label><nav className="chapter-list" aria-label="Briefing chapters">{filteredChapters.map(chapter => <button key={chapter.id} className={selected?.id === chapter.id ? 'chapter active' : 'chapter'} aria-current={selected?.id === chapter.id ? 'true' : undefined} onClick={() => selectChapter(chapter)} aria-label={`${chapterTitle(chapter, language)}${chapter.start ? ', ' + formatTime(chapter.start[language]) : ''}`}><span className="chapter-time">{chapter.start ? formatTime(chapter.start[language]) : <FileText size={14}/>}</span><span>{chapterTitle(chapter, language)}</span>{selected?.id === chapter.id ? <AudioLines size={16} className={playing ? 'is-playing' : ''}/> : <ChevronRight className="chapter-arrow" size={15}/>}</button>)}</nav>{!filteredChapters.length && <p className="no-results">{chinese ? '没有匹配的章节。' : 'No chapters match your search.'}</p>}<p className="chapter-help">{chinese ? '选择话题即可跳转。切换语言时，从同一话题的开头收听。' : 'Choose a chapter to seek. Switching languages starts the same topic in the other recording.'}</p></aside>
        <article className="chapter-detail" lang={chinese ? 'zh-CN' : 'en'} aria-label="Selected chapter">
          <div className="chapter-detail-top"><span className="story-kicker">{storyLabel}{story && <><span>/</span>{story.category}</>}</span><div className="language-switch mobile-language" role="group" aria-label="Chapter language"><button aria-pressed={!chinese} className={!chinese ? 'active' : ''} onClick={() => switchMedia(mode, 'en')}>English</button><button aria-pressed={chinese} className={chinese ? 'active' : ''} onClick={() => switchMedia(mode, 'zh')}>中文</button></div></div>
          <h2>{chapterTitle(selected, language)}</h2>{story?.community && <p className="community-meta">HN · {story.community.points} {chinese ? "积分" : "points"} · {story.community.comments} {chinese ? "评论" : "comments"} · {chinese ? `抽样 ${story.community.sampleSize} 条评论` : `${story.community.sampleSize} comments sampled`}</p>}
          <div className="chapter-caption"><span>{selected?.start ? `${chinese ? '开始于' : 'Begins at'} ${formatTime(selected.start[language])}` : (chinese ? '本话题尚无时间标记' : 'Chapter timing not yet available')}</span>{selected?.start && <button onClick={() => {seek(selected.start![language]); if (mediaRef.current?.paused) togglePlayback();}}><Play size={12} fill="currentColor"/>{chinese ? '播放本章' : 'Play chapter'}</button>}</div>
          <div className="mobile-format-switch mode-switch" role="group" aria-label="Chapter media format"><button aria-pressed={mode === 'audio'} className={mode === 'audio' ? 'active' : ''} onClick={() => switchMedia('audio', language)}><Headphones size={14}/>{chinese ? '收听' : 'Listen'}</button><button aria-pressed={mode === 'video'} className={mode === 'video' ? 'active' : ''} onClick={() => switchMedia('video', language)}><Video size={14}/>{chinese ? '观看' : 'Watch'}</button></div>
          {mode === 'video' && <div className="video-panel">{track?.video ? <video key={date + language + 'video'} ref={node => {mediaRef.current = node;}} controls playsInline preload="metadata" poster={mediaUrl(track.poster)} src={mediaUrl(track.video)} {...mediaEvents} aria-label={chinese ? '中文版视频简报' : 'English video briefing'}/> : <p className="media-message">{chinese ? '此版本尚未发布。请切换到收听。' : 'Video has not been published yet. Choose Listen for audio.'}</p>}<span>{chinese ? '配音播客视频 · AI 合成语音' : 'Narrated briefing · AI-generated voice'}</span></div>}
          {mode === 'audio' && track?.audio && <audio key={date + language + 'audio'} ref={node => {mediaRef.current = node;}} preload="metadata" src={mediaUrl(track.audio)} {...mediaEvents} aria-label={chinese ? '中文音频简报' : 'English audio briefing'}/>}
          {!mediaSource && mode === 'audio' && <p className="media-message" role="status">{chinese ? '音频尚未发布，请阅读本期简报。' : 'Audio has not been published yet. You can still read the briefing.'}</p>}
          {mediaError && <p className="media-message" role="alert">{chinese ? '暂时无法播放。请切换收听或观看，或刷新后重试。' : 'Playback is unavailable. Try the other format, or refresh and try again.'}</p>}
          {playNotice && <p className="media-message" role="status">{chinese ? '请按播放键继续。' : 'Press Play to continue playback.'}</p>}
          <div className="content-tabs" role="tablist" aria-label={chinese ? '章节内容' : 'Chapter content'}>{(['summary', 'script', 'sources'] as ContentTab[]).map(name => <button key={name} id={'tab-' + name} role="tab" aria-selected={tab === name} aria-controls={'panel-' + name} tabIndex={tab === name ? 0 : -1} onKeyDown={e => tabKey(e, name)} onClick={() => setTab(name)}>{name === 'summary' ? (chinese ? '摘要' : 'Summary') : name === 'script' ? (chinese ? '音频文稿' : 'Audio script') : <>{chinese ? '来源' : 'Sources'} <span>{sourceCount}</span></>}</button>)}</div>
          <div className="tab-content" id={'panel-' + tab} role="tabpanel" aria-labelledby={'tab-' + tab} tabIndex={0}>
            {tab === 'summary' && <>{story ? <><p className="lead-text">{chinese ? story.summaryZh : story.summary}</p><div className="reading-prompt"><AudioLines size={22}/><div><strong>{chinese ? '多一点背景，更多理解。' : 'A little context goes a long way.'}</strong><p>{chinese ? '收听本章分析，阅读完整文稿，或查看原始来源。' : 'Listen to the analysis, read the narration, or check the original sources.'}</p><div><button onClick={() => setTab('script')}>{chinese ? '阅读音频文稿' : 'Read audio script'}<ChevronRight size={14}/></button><button onClick={() => setTab('sources')}>{chinese ? '查看来源' : 'View sources'}<ArrowUpRight size={13}/></button></div></div></div></> : <><p className="lead-text">{chinese ? edition.descriptionZh : edition.description}</p><section className="takeaways"><h3>{isClosing ? (chinese ? '值得带走的要点' : 'Take these with you') : (chinese ? '今天值得记住的要点' : 'The ideas to take with you')}</h3>{(chinese ? edition.takeawaysZh : edition.takeaways).map((takeaway, index) => <p key={index}><span>{String(index + 1).padStart(2, '0')}</span>{takeaway}</p>)}</section></>}</>}
            {tab === 'script' && <>{selectedScript ? <><div className="script-label"><FileText size={14}/>{chinese ? '本章录音的原始文稿' : 'Verbatim narration for this chapter'}</div><div className="narration-text">{selectedScript.split(/\n\s*\n/).map((paragraph, index) => <p key={index} className={/^(The attractive design|The takeaway|My recommendation|因此，|实用建议)/.test(paragraph) ? 'script-insight' : undefined}>{paragraph}</p>)}</div></> : <p className="muted">{narration ? (chinese ? '本期尚未按章节拆分文稿。完整文稿在下方。' : 'This edition’s script is not divided into chapters yet. The complete narration is below.') : (chinese ? '本期尚未添加文稿。' : 'The narration script has not been added to this edition yet.')}</p>}{narration && <details className="full-script" key={date + language}><summary><span><FileText size={16}/>{chinese ? '完整音频文稿' : 'Full edition script'}</span><ChevronDown size={16}/></summary><div className="script-toolbar"><span>{chinese ? '本期完整录音文稿' : 'Complete narration, exactly as recorded'}</span><button onClick={downloadScript}><Download size={14}/>{chinese ? '下载文稿' : 'Download script'}</button></div><div className="narration-text">{narration.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></details>}</>}
            {tab === 'sources' && <><p className="muted sources-intro">{story ? (chinese ? '本话题的原始来源与相关报道。' : 'Original sources and reporting behind this topic.') : (chinese ? '本期所有话题的来源。' : 'Original sources for every story in this edition.')}</p><div className="source-list">{sourceItems.map(item => <section key={item.id}>{!story && <h3>{chinese ? item.titleZh : item.title}</h3>}{item.sources.map((source, index) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer"><span className="source-number">{String(index + 1).padStart(2, '0')}</span><span><strong>{source.label === 'Primary' ? (chinese ? '原始来源' : 'Original source') : source.label}</strong><small>{new URL(source.url).hostname.replace(/^www\./, '')}</small></span><ArrowUpRight size={18}/></a>)}</section>)}</div><details className="editorial-notes"><summary><span><Check size={16}/>{chinese ? '来源、范围与编辑说明' : 'Sources, scope & editorial notes'}</span><ChevronDown size={16}/></summary><p>{chinese ? edition.coverageNotesZh : edition.coverageNotes}</p></details></>}
          </div>
          <nav className="chapter-pagination" aria-label="Chapter navigation"><button aria-label={chinese ? '上一章' : 'Previous chapter'} disabled={selectedIndex <= 0} onClick={() => selectChapter(chapters[selectedIndex - 1])}><ChevronLeft size={17}/><span>{chinese ? '上一章' : 'Previous'}</span></button>{selectedIndex < chapters.length - 1 && <button className="next-chapter" onClick={() => selectChapter(chapters[selectedIndex + 1])}><span><small>{chinese ? '下一章' : 'UP NEXT'}</small>{chapterTitle(chapters[selectedIndex + 1], language)}</span><ChevronRight size={19}/></button>}</nav>
        </article>
      </section>
      <footer className="site-footer"><span><AudioLines size={15}/>Daily Signal</span><p>{chinese ? '依据原文独立撰写 · AI 合成语音' : 'Written from original sources · AI-generated voices'}</p><span>ENGLISH & 中文</span></footer>
      <section className="playback-dock" aria-label="Playback controls"><div className="dock-inner"><button className="play-button" aria-label={playing ? (chinese ? '暂停' : 'Pause') : (chinese ? '播放' : 'Play')} disabled={!mediaSource || mediaError} onClick={togglePlayback}>{playing ? <Pause size={22} fill="currentColor"/> : <Play size={23} fill="currentColor"/>}</button><button className="skip-seconds" disabled={!mediaSource || mediaError} aria-label={chinese ? "快退 15 秒" : "Rewind 15 seconds"} onClick={() => seek((mediaRef.current?.currentTime ?? currentTime) - 15)}>−15s</button><button className="skip-seconds" disabled={!mediaSource || mediaError} aria-label={chinese ? "快进 15 秒" : "Forward 15 seconds"} onClick={() => seek((mediaRef.current?.currentTime ?? currentTime) + 15)}>+15s</button><div className="now-playing"><strong>{chapterTitle(currentChapter, language) || (chinese ? '本期简报' : 'Your daily briefing')}</strong><span>{chinese ? '中文' : 'English'} <i>·</i> {mode === 'audio' ? (chinese ? '音频' : 'Audio') : (chinese ? '视频' : 'Video')}</span></div><div className="timeline"><div className="time-labels"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div><input type="range" min="0" max={duration || 1} step=".1" value={Math.min(currentTime, duration)} disabled={!mediaSource || mediaError} aria-label={chinese ? '播放进度' : 'Playback position'} aria-valuetext={`${formatTime(currentTime)} / ${formatTime(duration)}`} onChange={e => seek(Number(e.target.value))} style={{'--progress': `${duration ? currentTime / duration * 100 : 0}%`} as CSSProperties}/></div><label className="speed-control"><span className="sr-only">{chinese ? '播放速度' : 'Playback speed'}</span><select aria-label={chinese ? '播放速度' : 'Playback speed'} value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[.5, .75, 1, 1.25, 1.5, 1.75, 2].map(n => <option key={n} value={n}>{n}×</option>)}</select><ChevronDown size={12}/></label><button className="dock-next" disabled={selectedIndex >= chapters.length - 1} onClick={() => selectChapter(chapters[selectedIndex + 1])}>{chinese ? '下一章' : 'Next'}<ChevronRight size={18}/></button><button className="dock-chapters" aria-label={chinese ? '显示章节' : 'Show chapters'} onClick={() => {setMobileDetail(false); window.scrollTo({top: 0, behavior: 'smooth'});}}><List size={22}/></button></div></section>
    </>}
  </main>;
}
