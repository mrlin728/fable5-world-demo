/** Boot overlay progress reporting (also mirrored to hooks for tooling). */

import type { LaasHooks } from './Hooks';

export class BootUI {
  private msg: HTMLElement | null;
  private bar: HTMLElement | null;
  private root: HTMLElement | null;
  private hooks: LaasHooks;
  private slowTimer: number | null = null;

  constructor(hooks: LaasHooks) {
    this.hooks = hooks;
    this.msg = document.getElementById('boot-msg');
    this.bar = document.getElementById('boot-bar');
    this.root = document.getElementById('boot');
    const title = document.querySelector<HTMLElement>('#boot .title');
    if (title) title.textContent = 'OpenVZ World Lab';
    if (this.root) {
      this.root.style.display = 'flex';
      this.root.style.opacity = '1';
      this.root.classList.add('openvz-boot');
    }
    this.slowTimer = window.setTimeout(() => {
      if (this.msg && !this.hooks.ready) {
        this.msg.textContent = `${this.msg.textContent ?? ''} · This may take a moment on first launch.`;
      }
    }, 18000);
  }

  set(progress: number, message: string): void {
    this.hooks.progress = progress;
    this.hooks.progressMsg = message;
    if (this.msg) this.msg.textContent = this.brandMessage(message);
    if (this.bar) this.bar.style.width = `${Math.round(progress * 100)}%`;
  }

  hide(): void {
    if (this.slowTimer !== null) window.clearTimeout(this.slowTimer);
    this.set(1, 'Opening the world...');
    if (this.root) {
      this.root.style.opacity = '0';
      const el = this.root;
      setTimeout(() => {
        el.style.display = 'none';
      }, 600);
    }
  }

  private brandMessage(message: string): string {
    const msg = message.toLowerCase();
    if (msg.includes('webgpu') || msg.includes('renderer')) return 'Preparing WebGPU renderer...';
    if (msg.includes('terrain')) return 'Generating terrain...';
    if (msg.includes('river') || msg.includes('water')) return 'Carving rivers...';
    if (msg.includes('veg') || msg.includes('forest') || msg.includes('foliage')) {
      return 'Growing procedural forests...';
    }
    if (msg.includes('post') || msg.includes('sky') || msg.includes('atmos')) {
      return 'Building atmospheric lighting...';
    }
    if (msg.includes('ready')) return 'Opening the world...';
    return message;
  }
}
