import type { Engine } from '../core/Engine';
import type { CamPose, LaasHooks } from '../core/Hooks';
import type { LaasParams, QualityPreset } from '../core/Params';
import { isChromiumBrowser, isMobileDevice } from '../core/BrowserGate';

type Lang = 'en' | 'zh';

export interface LaunchOptions {
  force: boolean;
}

interface ShellOptions {
  launch: (options: LaunchOptions) => Promise<void>;
}

interface RuntimeSupport {
  mobile: boolean;
  chromium: boolean;
  webgpu: boolean;
}

const STORAGE_LANG = 'openvz-world-lab-lang';
const STORAGE_PROGRESS = 'openvz-world-lab-progress-v1';

const copy = {
  en: {
    brand: 'OpenVZ World Lab',
    subtitle: 'A browser-native procedural world experiment.',
    description:
      'Enter an immersive 3D world generated in real time with WebGPU terrain, forests, atmosphere, water, and exploratory camera controls.',
    enter: 'Enter World',
    low: 'Low Performance Mode',
    high: 'High Quality Mode',
    ultra: 'Ultra',
    random: 'Random Seed',
    preview: 'Watch Preview',
    controls: 'Controls',
    note: 'Best experienced on desktop Chrome with WebGPU.',
    fallbackTitle: 'OpenVZ World Lab requires desktop Chrome with WebGPU support.',
    fallbackBody:
      'Mobile, Safari, and Firefox may not support the full real-time world. You can preview the lab here or open anyway if you know your browser supports WebGPU.',
    openAnyway: 'Open Anyway',
    backHome: 'Back to Home',
    tryDesktop: 'Try Desktop Version',
    learnMore: 'Learn More',
    footerLeft: 'Real-time procedural terrain · WebGPU · no server',
    footerRight: 'Use Chrome desktop for the full world',
    ultraWarn: 'For powerful GPUs only.',
    objectiveTitle: 'World Objectives',
    objectives: [
      'Discover 5 signal points',
      'Visit 3 scenic viewpoints',
      'Take 1 photo',
      'Explore 3 time moods',
      'Find 3 World Archive fragments',
    ],
    moods: ['Dawn', 'Golden', 'Night'],
    reset: 'Reset Progress',
    photo: 'Photo Mode',
    copyLink: 'Copy View Link',
    randomWorld: 'Random World',
    exitPhoto: 'Exit Photo Mode',
    takePhoto: 'Take Photo',
    developer: 'Developer',
    copied: 'View link copied.',
    saved: 'Photo saved.',
    photoFailed: 'Screenshot unavailable, view link copied instead.',
    loadingError: 'Your browser could not start the 3D world. Please try the latest desktop Chrome.',
    previewCards: ['Procedural Terrain', 'Dynamic Atmosphere', 'Real-time Exploration', 'Browser-native 3D'],
    controlsList: [
      ['Move', 'W A S D'],
      ['Look', 'Click the world, then move mouse'],
      ['Walk/Fly', 'V'],
      ['Jump', 'Space'],
      ['Sprint', 'Shift'],
      ['Bookmarks', '1-9'],
      ['Photo Mode', 'M'],
      ['Developer Panel', 'F3'],
    ],
  },
  zh: {
    brand: 'OpenVZ World Lab',
    subtitle: '一个实时生成的浏览器 3D 世界实验。',
    description:
      '进入一个由 WebGPU 实时生成的沉浸式 3D 世界，包含地形、森林、天空、水体和可探索的镜头控制。',
    enter: '进入世界',
    low: '低性能模式',
    high: '高画质模式',
    ultra: '极致',
    random: '随机种子',
    preview: '观看预览',
    controls: '操作说明',
    note: '建议使用支持 WebGPU 的桌面版 Chrome 浏览器体验。',
    fallbackTitle: 'OpenVZ World Lab 需要桌面版 Chrome 和 WebGPU 支持。',
    fallbackBody:
      '手机、Safari 和 Firefox 可能无法运行完整实时世界。你可以先查看预览，也可以在确认浏览器支持 WebGPU 时强制打开。',
    openAnyway: '仍然打开',
    backHome: '返回首页',
    tryDesktop: '尝试桌面版',
    learnMore: '了解更多',
    footerLeft: '实时程序化地形 · WebGPU · 无服务器',
    footerRight: '完整体验请使用桌面 Chrome',
    ultraWarn: '仅适合高性能 GPU。',
    objectiveTitle: '探索目标',
    objectives: [
      '发现 5 个信号点',
      '到达 3 个观景点',
      '保存 1 张截图',
      '体验 3 种时间氛围',
      '找到 3 个世界档案碎片',
    ],
    moods: ['清晨', '金色时刻', '夜晚'],
    reset: '重置进度',
    photo: '拍照模式',
    copyLink: '复制视角链接',
    randomWorld: '随机世界',
    exitPhoto: '退出拍照',
    takePhoto: '保存截图',
    developer: '开发者',
    copied: '视角链接已复制。',
    saved: '截图已保存。',
    photoFailed: '截图不可用，已复制视角链接。',
    loadingError: '你的浏览器无法启动 3D 世界。请尝试最新版桌面 Chrome。',
    previewCards: ['程序化地形', '动态天空', '实时探索', '浏览器原生 3D'],
    controlsList: [
      ['移动', 'W A S D'],
      ['视角', '点击世界后移动鼠标'],
      ['步行/飞行', 'V'],
      ['跳跃', 'Space'],
      ['加速', 'Shift'],
      ['书签视角', '1-9'],
      ['拍照模式', 'M'],
      ['开发者面板', 'F3'],
    ],
  },
} as const;

type Copy = (typeof copy)[Lang];

function currentLanguage(): Lang {
  const stored = localStorage.getItem(STORAGE_LANG);
  if (stored === 'en' || stored === 'zh') return stored;
  return /^zh/i.test(navigator.language) ? 'zh' : 'en';
}

function setLanguage(lang: Lang): void {
  localStorage.setItem(STORAGE_LANG, lang);
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
}

function runtimeSupport(): RuntimeSupport {
  return {
    mobile: isMobileDevice(),
    chromium: isChromiumBrowser(),
    webgpu: 'gpu' in navigator && !!navigator.gpu,
  };
}

function explicitPreset(): QualityPreset | null {
  const preset = new URLSearchParams(window.location.search).get('preset');
  return preset === 'low' || preset === 'high' || preset === 'ultra' ? preset : null;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.className = className;
  el.type = 'button';
  el.textContent = text;
  el.addEventListener('click', onClick);
  return el;
}

export function createWorldLabShell(options: ShellOptions): void {
  let lang = currentLanguage();
  setLanguage(lang);
  let support = runtimeSupport();
  let selectedPreset: QualityPreset = explicitPreset() ?? 'low';
  let pendingSeed: number | null = null;
  let forcedHome = false;
  let modal: 'controls' | 'preview' | null = null;

  const root = document.createElement('div');
  root.className = 'vz-shell';
  document.body.appendChild(root);

  const t = () => copy[lang];

  const applyLaunchParams = (): void => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('preset') || selectedPreset !== (explicitPreset() ?? 'low')) {
      url.searchParams.set('preset', selectedPreset);
    }
    if (pendingSeed !== null) url.searchParams.set('seed', String(pendingSeed));
    window.history.replaceState(null, '', url);
  };

  const launch = (force = false): void => {
    applyLaunchParams();
    root.hidden = true;
    void options.launch({ force }).catch((err: unknown) => {
      root.hidden = false;
      showToast(t().loadingError);
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error('[openvz] launch failed', message);
    });
  };

  const renderLang = (): string => `
    <div class="vz-lang" role="group" aria-label="Language">
      <button type="button" data-lang="en" aria-pressed="${lang === 'en'}">English</button>
      <button type="button" data-lang="zh" aria-pressed="${lang === 'zh'}">中文</button>
    </div>
  `;

  const renderTop = (): string => `
    <div class="vz-topbar">
      <div class="vz-brand-mini"><span class="vz-mark"></span><span>${t().brand}</span></div>
      ${renderLang()}
    </div>
  `;

  const renderLanding = (): void => {
    const c = t();
    root.innerHTML = `
      ${renderTop()}
      <main class="vz-landing">
        <section class="vz-hero">
          <h1>${c.brand}</h1>
          <p class="vz-subtitle">${c.subtitle}</p>
          <p class="vz-description">${c.description}</p>
          <div class="vz-actions" data-actions></div>
          <p class="vz-note">${c.note}</p>
          <p class="vz-fine">${selectedPreset === 'ultra' ? c.ultraWarn : ''}</p>
        </section>
        <aside class="vz-visual" aria-label="World preview">
          <div class="vz-orbit"></div>
          <div class="vz-landform"></div>
          <div class="vz-visual-panel">
            <div class="vz-stat-row"><span>Preset</span><strong>${selectedPreset.toUpperCase()}</strong></div>
            <div class="vz-stat-row"><span>Renderer</span><strong>WebGPU</strong></div>
            <div class="vz-stat-row"><span>Seed</span><strong>${pendingSeed ?? new URLSearchParams(window.location.search).get('seed') ?? '1'}</strong></div>
          </div>
        </aside>
      </main>
      <div class="vz-footer"><span>${c.footerLeft}</span><span>${c.footerRight}</span></div>
      ${modal ? renderModal(modal) : ''}
    `;
    const actions = root.querySelector<HTMLElement>('[data-actions]');
    if (actions) {
      actions.append(
        button('vz-button vz-button-primary', c.enter, () => {
          support = runtimeSupport();
          if (!support.mobile && support.chromium && support.webgpu) launch(false);
          else {
            forcedHome = false;
            renderFallback();
          }
        }),
        button(`vz-button ${selectedPreset === 'low' ? 'vz-chip-active' : ''}`, c.low, () => {
          selectedPreset = 'low';
          renderLanding();
        }),
        button(`vz-button ${selectedPreset === 'high' ? 'vz-chip-active' : ''}`, c.high, () => {
          selectedPreset = 'high';
          renderLanding();
        }),
        button(`vz-button ${selectedPreset === 'ultra' ? 'vz-button-warn' : ''}`, c.ultra, () => {
          selectedPreset = 'ultra';
          renderLanding();
        }),
        button('vz-button', c.random, () => {
          pendingSeed = randomSeed();
          renderLanding();
        }),
        button('vz-button', c.preview, () => {
          modal = 'preview';
          renderLanding();
        }),
        button('vz-button', c.controls, () => {
          modal = 'controls';
          renderLanding();
        }),
      );
    }
    wireCommon();
  };

  const renderFallback = (): void => {
    const c = t();
    root.innerHTML = `
      ${renderTop()}
      <main class="vz-fallback">
        <section class="vz-fallback-card">
          <h1>${c.fallbackTitle}</h1>
          <p class="vz-description">${c.fallbackBody}</p>
          ${renderPreviewCards()}
          <div class="vz-actions" data-actions></div>
          <p class="vz-note">${c.note}</p>
        </section>
      </main>
    `;
    const actions = root.querySelector<HTMLElement>('[data-actions]');
    if (actions) {
      actions.append(
        button('vz-button vz-button-primary', c.openAnyway, () => launch(true)),
        button('vz-button', c.backHome, () => {
          forcedHome = true;
          renderLanding();
        }),
        button('vz-button', c.tryDesktop, () => showToast(c.note)),
        button('vz-button', c.learnMore, () => {
          modal = 'controls';
          renderFallback();
        }),
      );
    }
    wireCommon();
  };

  const renderPreviewCards = (): string => `
    <div class="vz-preview-grid">
      ${t().previewCards.map((name) => `<article class="vz-preview-card"><strong>${name}</strong><span class="vz-fine">${t().subtitle}</span></article>`).join('')}
    </div>
  `;

  const renderModal = (kind: 'controls' | 'preview'): string => {
    if (kind === 'preview') {
      return `
        <div class="vz-modal" role="dialog" aria-modal="true">
          <section class="vz-modal-card">
            <h2>${t().preview}</h2>
            <p class="vz-description">${t().description}</p>
            ${renderPreviewCards()}
            <button type="button" class="vz-button vz-button-primary" data-close>${t().backHome}</button>
          </section>
        </div>
      `;
    }
    return `
      <div class="vz-modal" role="dialog" aria-modal="true">
        <section class="vz-modal-card">
          <h2>${t().controls}</h2>
          <div class="vz-controls-grid">
            ${t().controlsList.map(([label, value]) => `<div class="vz-control"><strong>${label}</strong><p class="vz-fine">${value}</p></div>`).join('')}
          </div>
          <button type="button" class="vz-button vz-button-primary" data-close>${t().backHome}</button>
        </section>
      </div>
    `;
  };

  const wireCommon = (): void => {
    root.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((el) => {
      el.addEventListener('click', () => {
        lang = el.dataset.lang === 'zh' ? 'zh' : 'en';
        setLanguage(lang);
        if (support.mobile || !support.chromium || !support.webgpu) {
          if (forcedHome) renderLanding();
          else renderFallback();
        } else {
          renderLanding();
        }
      });
    });
    root.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((el) => {
      el.addEventListener('click', () => {
        modal = null;
        if (support.mobile || !support.chromium || !support.webgpu) renderFallback();
        else renderLanding();
      });
    });
  };

  if (support.mobile || !support.chromium || !support.webgpu) renderFallback();
  else renderLanding();
}

export class WorldLabOverlay {
  private root = document.createElement('div');
  private objectiveList = document.createElement('div');
  private dev = document.createElement('div');
  private photoBar = document.createElement('div');
  private params: LaasParams;
  private hooks: LaasHooks;
  private lang: Lang;
  private devVisible = false;
  private photoMode = false;
  private progress = loadProgress();
  private acc = 0;

  constructor(engine: Engine, params: LaasParams, hooks: LaasHooks) {
    this.params = params;
    this.hooks = hooks;
    this.lang = currentLanguage();
    this.root.className = 'vz-world-ui';
    document.body.appendChild(this.root);
    this.render();
    window.addEventListener('keydown', (event) => {
      if (event.code === 'F3') {
        this.devVisible = !this.devVisible;
        this.renderDev();
      }
      if (event.code === 'KeyM') this.togglePhoto();
    });
    engine.onUpdate((dt) => {
      this.acc += dt;
      if (this.acc > 0.5) {
        this.acc = 0;
        this.updateExploration();
        this.renderObjectives();
        this.renderDev();
      }
    });
  }

  private get c(): Copy {
    return copy[this.lang];
  }

  private render(): void {
    this.root.innerHTML = `
      <div class="vz-world-top">
        <div class="vz-brand-mini"><span class="vz-mark"></span><span>OpenVZ World Lab</span></div>
        <div class="vz-settings">
          <div class="vz-tool-row" data-top-tools></div>
        </div>
      </div>
      <section class="vz-objectives">
        <h2>${this.c.objectiveTitle}</h2>
        <div class="vz-objective-list" data-objectives></div>
        <div class="vz-tool-row" data-moods></div>
      </section>
      <div class="vz-photo-bar" data-photo-bar></div>
      <div class="vz-dev-panel vz-hidden" data-dev></div>
    `;
    this.objectiveList = this.root.querySelector('[data-objectives]') as HTMLDivElement;
    this.dev = this.root.querySelector('[data-dev]') as HTMLDivElement;
    this.photoBar = this.root.querySelector('[data-photo-bar]') as HTMLDivElement;
    this.root.querySelector('[data-top-tools]')?.append(
      button('vz-chip', this.c.developer, () => {
        this.devVisible = !this.devVisible;
        this.renderDev();
      }),
      button('vz-chip', this.c.controls, () => showControlsModal(this.lang)),
    );
    const moods = this.root.querySelector('[data-moods]');
    if (moods) {
      moods.append(
        button('vz-chip', this.c.moods[0], () => this.setMood(6)),
        button('vz-chip', this.c.moods[1], () => this.setMood(17)),
        button('vz-chip', this.c.moods[2], () => this.setMood(22)),
        button('vz-chip', this.c.reset, () => this.resetProgress()),
      );
    }
    this.renderPhotoBar();
    this.renderObjectives();
    this.renderDev();
  }

  private setMood(tod: number): void {
    this.hooks.setTimeOfDay?.(tod);
    this.progress.moods[String(tod)] = true;
    this.save();
    this.renderObjectives();
  }

  private updateExploration(): void {
    const pose = this.hooks.getPose?.();
    if (!pose) return;
    for (const point of [...signalPoints, ...viewpoints, ...fragments]) {
      if (distance2d(pose, point.x, point.z) < point.radius) {
        if (point.kind === 'signal') this.progress.signals[point.id] = true;
        if (point.kind === 'view') this.progress.views[point.id] = true;
        if (point.kind === 'fragment') this.progress.fragments[point.id] = true;
      }
    }
    this.save();
  }

  private renderObjectives(): void {
    const labels = this.c.objectives;
    const rows = [
      objectiveRow(labels[0], count(this.progress.signals), 5),
      objectiveRow(labels[1], count(this.progress.views), 3),
      objectiveRow(labels[2], this.progress.photo ? 1 : 0, 1),
      objectiveRow(labels[3], count(this.progress.moods), 3),
      objectiveRow(labels[4], count(this.progress.fragments), 3),
    ];
    this.objectiveList.innerHTML = rows
      .map((row) => `
        <div class="vz-objective ${row.done ? 'vz-objective-done' : ''}">
          <span class="vz-dot"></span>
          <span>${row.label}</span>
          <span>${row.value}</span>
        </div>
      `)
      .join('');
  }

  private renderPhotoBar(): void {
    this.photoBar.replaceChildren(
      button('vz-chip', this.photoMode ? this.c.exitPhoto : this.c.photo, () => this.togglePhoto()),
      button('vz-chip', this.c.copyLink, () => void this.copyViewLink()),
      button('vz-chip', this.c.takePhoto, () => void this.takePhoto()),
      button('vz-chip', this.c.randomWorld, () => this.randomWorld()),
    );
  }

  private renderDev(): void {
    this.dev.classList.toggle('vz-hidden', !this.devVisible);
    if (!this.devVisible) return;
    const stats = this.hooks.stats;
    const pose = this.hooks.getPose?.();
    const diag = this.hooks.diag;
    this.dev.innerHTML = `<h2>Developer</h2>${[
      `fps: ${stats?.fps.toFixed(0) ?? '-'}`,
      `preset: ${this.params.preset}`,
      `seed: ${this.params.seed}`,
      `camera: ${pose ? camToString(pose) : '-'}`,
      `webgpu: ${diag?.ok ? 'ready' : 'unknown'}`,
      `adapter: ${diag ? `${diag.vendor ?? '?'} ${diag.device ?? ''}` : '-'}`,
      `browser: ${navigator.userAgent}`,
      `draws: ${stats?.drawCalls.toLocaleString('en-US') ?? '-'}`,
      `triangles: ${stats?.triangles.toLocaleString('en-US') ?? '-'}`,
    ].join('\n')}`;
  }

  private togglePhoto(): void {
    this.photoMode = !this.photoMode;
    document.body.classList.toggle('openvz-photo-mode', this.photoMode);
    const existing = document.querySelector('.vz-photo-overlay');
    if (existing) existing.remove();
    if (this.photoMode) {
      const overlay = document.createElement('div');
      overlay.className = 'vz-photo-overlay';
      this.root.appendChild(overlay);
      showToast(this.c.photo);
    }
    this.renderPhotoBar();
  }

  private async copyViewLink(): Promise<void> {
    const link = this.viewLink();
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt('Copy view link', link);
    }
    showToast(this.c.copied);
  }

  private async takePhoto(): Promise<void> {
    const canvas = document.querySelector<HTMLCanvasElement>('#app canvas');
    if (!canvas) {
      await this.copyViewLink();
      showToast(this.c.photoFailed);
      return;
    }
    this.progress.photo = true;
    this.save();
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('canvas capture unavailable');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `openvz-world-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(this.c.saved);
    } catch {
      await this.copyViewLink();
      showToast(this.c.photoFailed);
    }
    this.renderObjectives();
  }

  private viewLink(): string {
    const url = new URL(window.location.href);
    const pose = this.hooks.getPose?.();
    url.searchParams.set('preset', this.params.preset);
    url.searchParams.set('seed', String(this.params.seed));
    url.searchParams.set('T', String(this.params.timeOfDay));
    if (pose) url.searchParams.set('cam', camToString(pose));
    return url.toString();
  }

  private randomWorld(): void {
    const url = new URL(window.location.href);
    url.searchParams.set('seed', String(randomSeed()));
    url.searchParams.set('preset', this.params.preset);
    window.location.href = url.toString();
  }

  private resetProgress(): void {
    this.progress = emptyProgress();
    this.save();
    this.renderObjectives();
  }

  private save(): void {
    localStorage.setItem(STORAGE_PROGRESS, JSON.stringify(this.progress));
  }
}

function showControlsModal(lang: Lang): void {
  const existing = document.querySelector('.vz-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.className = 'vz-modal';
  modal.innerHTML = `
    <section class="vz-modal-card">
      <h2>${copy[lang].controls}</h2>
      <div class="vz-controls-grid">
        ${copy[lang].controlsList.map(([label, value]) => `<div class="vz-control"><strong>${label}</strong><p class="vz-fine">${value}</p></div>`).join('')}
      </div>
      <button type="button" class="vz-button vz-button-primary" data-close>${copy[lang].backHome}</button>
    </section>
  `;
  document.body.appendChild(modal);
  modal.querySelector('[data-close]')?.addEventListener('click', () => modal.remove());
}

function showToast(message: string): void {
  const old = document.querySelector('.vz-toast');
  if (old) old.remove();
  const toast = document.createElement('div');
  toast.className = 'vz-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2200);
}

function camToString(pose: CamPose): string {
  const [x, y, z] = pose.p;
  const f = (n: number): string => n.toFixed(2);
  return `${f(x)},${f(y)},${f(z)},${pose.yaw.toFixed(4)},${pose.pitch.toFixed(4)},${(pose.fov ?? 55).toFixed(0)}`;
}

function distance2d(pose: CamPose, x: number, z: number): number {
  const dx = pose.p[0] - x;
  const dz = pose.p[2] - z;
  return Math.hypot(dx, dz);
}

function count(values: Record<string, boolean>): number {
  return Object.values(values).filter(Boolean).length;
}

function objectiveRow(label: string, done: number, total: number): { label: string; value: string; done: boolean } {
  return { label, value: `${Math.min(done, total)}/${total}`, done: done >= total };
}

interface ProgressState {
  signals: Record<string, boolean>;
  views: Record<string, boolean>;
  fragments: Record<string, boolean>;
  moods: Record<string, boolean>;
  photo: boolean;
}

function emptyProgress(): ProgressState {
  return { signals: {}, views: {}, fragments: {}, moods: {}, photo: false };
}

function loadProgress(): ProgressState {
  try {
    const raw = localStorage.getItem(STORAGE_PROGRESS);
    if (!raw) return emptyProgress();
    return { ...emptyProgress(), ...JSON.parse(raw) } as ProgressState;
  } catch {
    return emptyProgress();
  }
}

interface WorldPoint {
  id: string;
  kind: 'signal' | 'view' | 'fragment';
  x: number;
  z: number;
  radius: number;
}

const signalPoints: WorldPoint[] = [
  { id: 'Signal Point Alpha', kind: 'signal', x: 620, z: 650, radius: 180 },
  { id: 'Signal Point Beta', kind: 'signal', x: 760, z: 690, radius: 170 },
  { id: 'Signal Point Gamma', kind: 'signal', x: 420, z: 720, radius: 170 },
  { id: 'Signal Point Delta', kind: 'signal', x: 610, z: 430, radius: 170 },
  { id: 'Signal Point Epsilon', kind: 'signal', x: 840, z: 520, radius: 170 },
];

const viewpoints: WorldPoint[] = [
  { id: 'Sky Ridge Viewpoint', kind: 'view', x: 620, z: 650, radius: 210 },
  { id: 'River Mirror Viewpoint', kind: 'view', x: 500, z: 780, radius: 190 },
  { id: 'Forest Edge Viewpoint', kind: 'view', x: 830, z: 640, radius: 190 },
];

const fragments: WorldPoint[] = [
  { id: 'World Archive Fragment I', kind: 'fragment', x: 650, z: 620, radius: 150 },
  { id: 'World Archive Fragment II', kind: 'fragment', x: 760, z: 450, radius: 150 },
  { id: 'World Archive Fragment III', kind: 'fragment', x: 380, z: 640, radius: 150 },
];
