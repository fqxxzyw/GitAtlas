import { useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, SkipBack, SkipForward, Play, Pause, VolumeX } from 'lucide-react';
import { useAtlas, day } from '../core/store';
import { milestones } from '../core/history';
import { MagneticButton } from './ui';
export function Player() {
  const { data, index, playing, speed, play, seek, set } = useAtlas();
  const stops = useMemo(
    () =>
      data
        ? milestones(data).map((m) => ({
            index: data.commits.findIndex((c) => c.hash === m.commit.hash),
            title: m.title,
          }))
        : [],
    [data],
  );
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      const s = useAtlas.getState();
      const last = (s.data?.commits.length ?? 1) - 1;
      if (s.index >= last) s.set({ playing: false });
      else s.seek(s.index + 1);
    }, 1500 / speed);
    return () => clearInterval(interval);
  }, [playing, speed]);
  if (!data?.commits.length) return null;
  const commit = data.commits[index];
  return (
    <footer className="player">
      <div className="player-intro">
        <span className={`player-orb ${playing ? 'playing' : ''}`}>
          <GitGlyph />
        </span>
        <div>
          <strong>时光播放器</strong>
          <small>{playing ? '正在回放项目历史' : '一个提交，一个时刻'}</small>
        </div>
      </div>
      <div className="player-controls">
        <button
          className="icon-button"
          title="第一次提交 · Home"
          aria-label="第一次提交"
          onClick={() => {
            seek(0);
            set({ playing: false });
          }}
        >
          <SkipBack size={16} />
        </button>
        <button
          className="icon-button"
          title="上一次 · ←"
          aria-label="上一次提交"
          onClick={() => {
            seek(index - 1);
            set({ playing: false });
          }}
          disabled={index === 0}
        >
          <ChevronLeft size={19} />
        </button>
        <MagneticButton
          className="play-button"
          aria-label={playing ? '暂停播放' : '播放历史'}
          title="播放 / 暂停 · Space"
          onClick={play}
        >
          {playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
        </MagneticButton>
        <button
          className="icon-button"
          title="下一次 · →"
          aria-label="下一次提交"
          onClick={() => {
            seek(index + 1);
            set({ playing: false });
          }}
          disabled={index === data.commits.length - 1}
        >
          <ChevronRight size={19} />
        </button>
        <button
          className="icon-button"
          title="最新提交 · End"
          aria-label="最新提交"
          onClick={() => {
            seek(data.commits.length - 1);
            set({ playing: false });
          }}
        >
          <SkipForward size={16} />
        </button>
      </div>
      <div className="scrubber">
        <div className="scrubber-label">
          <span>
            <strong>{String(index + 1).padStart(3, '0')}</strong> / {data.commits.length}{' '}
            <small>COMMITS</small>
          </span>
          <span>{day(commit.date)}</span>
        </div>
        <div className="range-wrap">
          <input
            aria-label="提交进度"
            type="range"
            min="0"
            max={Math.max(0, data.commits.length - 1)}
            step="0.01"
            value={index}
            style={
              {
                '--progress': `${(index / Math.max(1, data.commits.length - 1)) * 100}%`,
              } as React.CSSProperties
            }
            onChange={(e) => {
              const n = Number(e.target.value);
              const near = stops.find((s) => Math.abs(n - s.index) < 0.4);
              seek(near?.index ?? Math.round(n));
              set({ playing: false });
            }}
          />
          {stops.map((s, i) => (
            <button
              key={`${s.index}-${i}`}
              title={s.title}
              aria-label={`跳转到${s.title}`}
              className="range-marker"
              style={{ left: `${(s.index / Math.max(1, data.commits.length - 1)) * 100}%` }}
              onClick={() => {
                seek(s.index);
                set({ playing: false });
              }}
            />
          ))}
        </div>
      </div>
      <select
        className="speed"
        aria-label="播放速度"
        value={speed}
        onChange={(e) => set({ speed: Number(e.target.value) })}
      >
        {[0.5, 1, 2, 4].map((n) => (
          <option key={n} value={n}>
            {n}×
          </option>
        ))}
      </select>
      <VolumeX size={16} className="player-muted" aria-label="无音频" />
    </footer>
  );
}
function GitGlyph() {
  return <span className="mini-orbit" />;
}
