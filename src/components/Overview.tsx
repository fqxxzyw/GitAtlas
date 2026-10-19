import { useMemo, useState } from 'react';
import { ArrowRight, GitCommitHorizontal, GitBranch, Layers, Play, ShieldCheck, Flag } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAtlas, fmt, day } from '../core/store';
import { contributors, fileTypes, milestones } from '../core/history';
import { Chart } from './Chart';
import { Panel, Metric, SectionTitle, MagneticButton } from './ui';
export function Overview() {
  const { data, set, seek } = useAtlas();
  const [metric, setMetric] = useState('files');
  const series = useMemo(
    () =>
      data
        ? data.commits.map((c, i) =>
            metric === 'files'
              ? data.snapshots[c.hash].totalFiles
              : metric === 'commits'
                ? i + 1
                : metric === 'insertions'
                  ? c.stats.insertions
                  : c.stats.deletions,
          )
        : [],
    [data, metric],
  );
  const labels = useMemo(() => data?.commits.map((c) => day(c.date).slice(5)) ?? [], [data]);
  if (!data || !data.commits.length) return null;
  const last = data.commits.at(-1)!;
  const snapshot = data.snapshots[last.hash];
  const people = contributors(data.commits);
  const first = data.firstCommit;
  const duration = Math.max(
    0,
    Math.round((Date.parse(last.date) - Date.parse(first?.date ?? data.commits[0].date)) / 86400000),
  );
  return (
    <div className="page overview">
      <SectionTitle
        eyebrow="YOUR REPOSITORY, IN PERSPECTIVE"
        title="每一步，都有迹可循。"
        description="回到最初的想法，重新看见项目生长的过程。"
        action={
          <span className="privacy-pill">
            <ShieldCheck size={14} /> 本地 · 只读 · 私密
          </span>
        }
      />
      <Panel className="hero">
        <div className="hero-copy">
          <span className="overline">
            <span className="status-dot" /> REPOSITORY STORY
          </span>
          <h2>{data.repository}</h2>
          <p>
            从第一行代码，到此刻的模样。
            <br />把 {fmt(data.totalCommits)} 次提交，连成一段可以播放的历史。
          </p>
          <MagneticButton
            className="primary"
            onClick={() => {
              seek(0);
              set({ view: 'timeline', playing: true });
            }}
          >
            <Play size={15} fill="currentColor" /> 播放项目历史 <ArrowRight size={16} />
          </MagneticButton>
          <div className="hero-caption">
            {day(first?.date)} <span>—</span> {day(last.date)}
          </div>
        </div>
        <div className="history-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <svg className="story-path" viewBox="0 0 520 280">
            <defs>
              <linearGradient id="line" x1="0" x2="1">
                <stop stopColor="#91b9f3" />
                <stop offset="1" stopColor="#447fe7" />
              </linearGradient>
            </defs>
            <path
              d="M40 220C100 220 80 164 150 164S210 104 272 104S330 60 460 60"
              fill="none"
              stroke="url(#line)"
              strokeWidth="3"
            />
            <path
              d="M150 164C225 164 225 218 300 218S360 60 460 60"
              fill="none"
              stroke="#b4a6d6"
              strokeWidth="2"
              strokeDasharray="5 6"
            />
            {[
              [40, 220],
              [150, 164],
              [272, 104],
              [460, 60],
            ].map(([cx, cy], i) => (
              <g key={i}>
                <circle cx={cx} cy={cy} r="13" fill="var(--surface)" />
                <circle cx={cx} cy={cy} r="5" fill="#5485d4" />
              </g>
            ))}
          </svg>
          <motion.div
            className="art-card art-back"
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          >
            <GitCommitHorizontal size={18} />
            <span>
              FIRST COMMIT<strong>{data.commits[0].message}</strong>
            </span>
            <code>{data.commits[0].shortHash}</code>
          </motion.div>
          <motion.div
            className="art-card art-front"
            initial={{ y: 25, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 100, damping: 20, delay: 0.1 }}
          >
            <div className="art-icon">
              <Layers size={24} />
            </div>
            <span>
              GROWING TOGETHER
              <strong>
                {fmt(snapshot.totalFiles)} <em>files</em>
              </strong>
            </span>
            <div className="tiny-bars">
              {[20, 30, 27, 42, 38, 52, 64, 58, 75, 88].map((n, i) => (
                <i key={i} style={{ height: n / 2 }} />
              ))}
            </div>
          </motion.div>
          <span className="art-label">
            <GitBranch size={12} /> {data.branch}
          </span>
        </div>
      </Panel>
      <div className="metrics">
        <Metric label="提交足迹" value={fmt(data.totalCommits)} note={`${data.commits.length} 次已加载`} />
        <Metric label="当前文件" value={fmt(snapshot.totalFiles)} note="分支最新提交的真实快照" />
        <Metric label="贡献者" value={fmt(people.length)} note="已加载历史 · 按身份合并" />
        <Metric label="跨越时间" value={`${duration}`} note="天 · 按提交时间计算" />
      </div>
      <div className="overview-grid">
        <Panel>
          <div className="panel-heading">
            <div>
              <h3>看见生长</h3>
              <p>Repository growth</p>
            </div>
            <select aria-label="增长图指标" value={metric} onChange={(e) => setMetric(e.target.value)}>
              <option value="files">文件数量</option>
              <option value="commits">累计提交（已加载）</option>
              <option value="insertions">新增行</option>
              <option value="deletions">删除行</option>
            </select>
          </div>
          <Chart labels={labels} values={series} label={metric} />
        </Panel>
        <Panel className="language-panel">
          <div className="panel-heading">
            <div>
              <h3>项目的构成</h3>
              <p>按文件数量统计</p>
            </div>
            <Layers size={17} />
          </div>
          <div className="type-bar">
            {fileTypes(snapshot).map(([ext, n], i) => (
              <i
                title={`${ext}: ${n}`}
                key={ext}
                style={{
                  flex: n,
                  background: ['#5486dc', '#a3b7db', '#9f91bd', '#94b9ad', '#d0b792'][i % 5],
                }}
              />
            ))}
          </div>
          <div className="type-list">
            {fileTypes(snapshot)
              .slice(0, 6)
              .map(([ext, n], i) => (
                <div key={ext}>
                  <span>
                    <i
                      style={{ background: ['#5486dc', '#a3b7db', '#9f91bd', '#94b9ad', '#d0b792'][i % 5] }}
                    />
                    .{ext}
                  </span>
                  <strong>
                    {Math.round((n / snapshot.totalFiles) * 100)}
                    <small>%</small>
                  </strong>
                </div>
              ))}
          </div>
          <small className="muted">二进制与源码行数不混算，不推测总行数。</small>
        </Panel>
      </div>
      <Panel>
        <div className="panel-heading">
          <div>
            <h3>沿途的里程碑</h3>
            <p>由明确规则识别的项目节点</p>
          </div>
          <Flag size={17} />
        </div>
        <div className="milestones">
          {milestones(data).map((m) => (
            <button
              key={m.title}
              onClick={() => {
                seek(data.commits.findIndex((c) => c.hash === m.commit.hash));
                set({ view: 'timeline' });
              }}
            >
              <span className="milestone-dot" />
              <small>{day(m.commit.date)}</small>
              <strong>{m.title}</strong>
              <span>{m.commit.message}</span>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
