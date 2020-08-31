import { html, render } from 'uhtml';

import { checkPassiveEventListener } from './helpers/checkPassiveEventListener';
import { applyFocusVisiblePolyfill } from './helpers/focus-visible';
import { getFileAudioBuffer } from './helpers/getFileAudioBuffer';
import { withMediaSession } from './helpers/withMediaSession';
import { getDisplayName } from './helpers/getDisplayName';
import { fetchSource } from './helpers/fetchSource';
import { formatTime } from './helpers/formatTime';
import { hexToRGB } from './helpers/hexToRGB';
import { Play } from './components/Icons/Play';
import { Pause } from './components/Icons/Pause';

const SPACING = 20;
const CONTAINER_WIDTH = 900;
const CONTAINER_HEIGHT = 260;
const HEIGHT = CONTAINER_HEIGHT - SPACING * 2;
const BAR_WIDTH = 4;
const BAR_HANDLE_RADIUS = 8;
const BAR_CENTER = (BAR_WIDTH - 1) / 2;
const BAR_GAP = false;
const FONT_FAMILY = 'monospace';
const FONT_SIZE = 10;
const FONT = `${FONT_SIZE}px ${FONT_FAMILY}`;
const TIME_ANNOTATION_WIDTH = 40;
const BAR_COLOR = '#166a77';
const BACKGROUND_COLOR = '#113042';
const SLICE_COLOR = '#37f0c2';

class AudioWaveformPlayer extends HTMLElement {
  constructor() {
    super().attachShadow({ mode: 'open' });
    this.renderer = render.bind(this, this.shadowRoot);
    this.audioRef = this.audioRef.bind(this);
    this.handlePlayPauseClick = this.handlePlayPauseClick.bind(this);
    this.handleSourceTimeUpdate = this.handleSourceTimeUpdate.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

    this.pixelRatio =
      // FIXME: Force pixelRatio=1 otherwise devices > 1 only draw half
      1 || window.devicePixelRatio || screen.deviceXDPI / screen.logicalXDPI;
    this.halfPixel = 0.5 / this.pixelRatio;
  }

  get src() {
    return this.getAttribute('src');
  }

  async connectedCallback() {
    this.supportsPassiveEventListener = checkPassiveEventListener();
    this.evtHandlerOptions = this.supportsPassiveEventListener
      ? { passive: true }
      : true;
    applyFocusVisiblePolyfill(this.shadowRoot);

    this.render();
    this.setupContainer();

    this.file = await fetchSource(this.src);
    this.objectURL = URL.createObjectURL(this.file);

    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    getFileAudioBuffer(this.file, this.audioCtx).then((audioBuffer) => {
      this.audioBuffer = audioBuffer;
      this.onAudioDecoded();
    });
  }

  audioRef(audio) {
    if (audio && audio !== this.audio) {
      if (this.audio) {
        this.audio.removeEventListener(
          'timeupdate',
          this.handleSourceTimeUpdate,
          this.evtHandlerOptions
        );
      }
      this.audio = audio;
      this.audio.addEventListener(
        'timeupdate',
        this.handleSourceTimeUpdate,
        this.evtHandlerOptions
      );
    }
  }

  /**
   * Set the rendered length (different from the length of the audio).
   *
   * @param {number} length
   */
  setLength(length) {
    this.splitPeaks = [];
    this.mergedPeaks = [];
    // Set the last element of the sparse array so the peak arrays are
    // appropriately sized for other calculations.
    const channels = this.audioBuffer.numberOfChannels;
    let c;
    for (c = 0; c < channels; c++) {
      this.splitPeaks[c] = [];
      this.splitPeaks[c][2 * (length - 1)] = 0;
      this.splitPeaks[c][2 * (length - 1) + 1] = 0;
    }
    this.mergedPeaks[2 * (length - 1)] = 0;
    this.mergedPeaks[2 * (length - 1) + 1] = 0;
  }

  /**
   * Compute the max and min value of the waveform when broken into <length> subranges.
   *
   * @param {number} length How many subranges to break the waveform into.
   * @param {number} first First sample in the required range.
   * @param {number} last Last sample in the required range.
   * @return {number[]|number[][]} Array of 2*<length> peaks or array of arrays of
   * peaks consisting of (max, min) values for each subrange.
   */
  getPeaks(length, first, last) {
    first = first || 0;
    last = last || length - 1;

    this.setLength(length);

    const sampleSize = this.audioBuffer.length / length;
    const sampleStep = ~~(sampleSize / 10) || 1;
    const channels = this.audioBuffer.numberOfChannels;
    let c;

    for (c = 0; c < channels; c++) {
      const peaks = this.splitPeaks[c];
      const chan = this.audioBuffer.getChannelData(c);
      let i;

      for (i = first; i <= last; i++) {
        const start = ~~(i * sampleSize);
        const end = ~~(start + sampleSize);
        let min = 0;
        let max = 0;
        let j;

        for (j = start; j < end; j += sampleStep) {
          const value = chan[j];

          if (value > max) {
            max = value;
          }

          if (value < min) {
            min = value;
          }
        }

        peaks[2 * i] = max;
        peaks[2 * i + 1] = min;

        if (c == 0 || max > this.mergedPeaks[2 * i]) {
          this.mergedPeaks[2 * i] = max;
        }

        if (c == 0 || min < this.mergedPeaks[2 * i + 1]) {
          this.mergedPeaks[2 * i + 1] = min;
        }
      }
    }

    return this.mergedPeaks;
  }

  async onAudioDecoded() {
    this.render();
    this.setupCanvases();

    this.canvases.addEventListener(
      'mousemove',
      this.handleMouseMove,
      this.evtHandlerOptions
    );
    this.canvases.addEventListener(
      'touchmove',
      this.handleMouseMove,
      this.evtHandlerOptions
    );

    this.canvases.addEventListener(
      'mousedown',
      this.handleMouseDown,
      this.evtHandlerOptions
    );
    this.canvases.addEventListener(
      'touchstart',
      this.handleMouseDown,
      this.evtHandlerOptions
    );
    this.canvases.addEventListener(
      'keydown',
      this.handleKeyDown,
      this.evtHandlerOptions
    );

    const width = this.width;
    const start = 0;
    const end = this.width;

    const peaks = this.getPeaks(width, start, end);
    await this.drawBars(peaks, 0, this.width);
    this.drawn = true;
  }

  getDuration() {
    return this.audioBuffer.duration;
  }

  handleKeyDown(evt) {
    const duration = this.getDuration();
    const currentTime = this.audio.currentTime;

    let percentage = Math.round((currentTime / duration) * 100);
    let stop = false;

    switch (evt.key) {
      case 'ArrowLeft':
        percentage -= 1;
        break;
      case 'ArrowRight':
        percentage += 1;
        break;
      case 'ArrowUp':
        percentage += 10;
        break;
      case 'ArrowDown':
        percentage -= 10;
        break;
      case 'Home':
        percentage = 0;
        break;
      case 'End':
        percentage = 99.9; // 100 would trigger onEnd, so only 99.9
        break;
      default:
        stop = true;
        break;
    }

    if (stop) return;

    percentage = Math.min(Math.max(percentage, 0), 100);

    this.audio.currentTime = (duration / 100) * percentage;
  }

  handleMouseMove(evt) {
    const touch = evt.touches;
    requestAnimationFrame(() => {
      const duration = this.getDuration();
      const xContainer =
        (touch ? evt.touches[0] : evt).clientX -
        this.boundingClientRect.left +
        this.container.scrollLeft;

      const newBoundaryPos = Math.min(
        Math.max(xContainer, SPACING),
        this.width + SPACING
      );

      const canvasCtx = this.canvasContexts['cursor'];
      canvasCtx.clearRect(0, 0, this.containerWidth, CONTAINER_HEIGHT);
      this.drawBoundary(canvasCtx, newBoundaryPos);
    });
  }

  handleMouseDown(evt) {
    const touch = evt.touches;
    const xContainer =
      (touch ? evt.touches[0] : evt).clientX -
      this.boundingClientRect.left +
      this.container.scrollLeft;

    const duration = this.getDuration();
    const boundary = Math.min(Math.max(xContainer - SPACING, 0), this.width);
    const currentTime = (duration / this.width) * boundary;

    this.audio.currentTime = currentTime;

    this.canvases.addEventListener(
      'mouseup',
      this.handleMouseUp,
      this.evtHandlerOptions
    );
    this.canvases.addEventListener(
      'touchend',
      this.handleMouseUp,
      this.evtHandlerOptions
    );
  }

  async handleMouseUp(evt) {
    this.canvases.removeEventListener(
      'touchend',
      this.handleMouseUp,
      this.evtHandlerOptions
    );
    this.canvases.removeEventListener(
      'mouseup',
      this.handleMouseUp,
      this.evtHandlerOptions
    );

    const xContainer =
      (evt.changedTouches ? evt.changedTouches[0] : evt).clientX -
      this.boundingClientRect.left +
      this.container.scrollLeft;

    const duration = this.getDuration();
    const boundary = Math.min(Math.max(xContainer - SPACING, 0), this.width);
    const currentTime = (duration / this.width) * boundary;

    this.audio.currentTime = currentTime;
  }

  drawBoundary(canvasCtx, x) {
    canvasCtx.fillStyle = SLICE_COLOR;
    canvasCtx.fillRect(x, 0, BAR_WIDTH / 2, HEIGHT);
    canvasCtx.beginPath();
    canvasCtx.arc(
      x + BAR_CENTER,
      HEIGHT - BAR_HANDLE_RADIUS,
      BAR_HANDLE_RADIUS,
      0,
      2 * Math.PI
    );
    canvasCtx.fill();
    canvasCtx.beginPath();
    canvasCtx.arc(
      x + BAR_CENTER,
      BAR_HANDLE_RADIUS,
      BAR_HANDLE_RADIUS,
      0,
      2 * Math.PI
    );
    canvasCtx.fill();

    const time = Math.max((this.getDuration() / this.width) * (x - SPACING), 0);
    const formattedTime = formatTime(time);
    const textSpacing = BAR_HANDLE_RADIUS + SPACING / 2;
    const textX =
      this.width - x < TIME_ANNOTATION_WIDTH + textSpacing
        ? x - TIME_ANNOTATION_WIDTH - textSpacing
        : x + textSpacing;
    const textY = FONT_SIZE;
    canvasCtx.fillText(formattedTime, textX, textY);
  }

  handleSourceTimeUpdate() {
    if (!this.drawn) return;

    requestAnimationFrame(() => {
      const duration = this.getDuration();

      const x = Math.round((this.width / duration) * this.audio.currentTime);
      const startX = Math.round((this.width / duration) * 0);
      const width = x - startX;

      const canvasCtx = this.canvasContexts['progress'];

      if (!width) {
        canvasCtx.clearRect(0, 0, this.width, HEIGHT);
        return;
      }

      const partial = this.canvasContexts['waveform'].getImageData(
        startX,
        0,
        width,
        HEIGHT
      );
      const imageData = partial.data;

      const progressColor = hexToRGB(SLICE_COLOR);
      // Loops through all of the pixels and modifies the components.
      for (let i = 0, n = imageData.length; i < n; i += 4) {
        imageData[i] = progressColor[0]; // Red component
        imageData[i + 1] = progressColor[1]; // Green component
        imageData[i + 2] = progressColor[2]; // Blue component
        //pix[i+3] is the transparency.
      }

      canvasCtx.clearRect(0, 0, this.width, HEIGHT);
      canvasCtx.putImageData(partial, startX, 0);
      this.render();
    });
  }

  drawBars(peaks, start, end) {
    return new Promise((resolve) => {
      this.prepareDraw(
        peaks,
        start,
        end,
        ({ hasMinVals, offsetY, halfH, peaks }) => {
          // Skip every other value if there are negatives.
          const peakIndexScale = hasMinVals ? 2 : 1;
          const length = peaks.length / peakIndexScale;
          const bar = BAR_WIDTH * this.pixelRatio;
          const gap = BAR_GAP ? Math.max(this.pixelRatio, ~~(bar / 2)) : 0;
          const step = bar + gap;

          const scale = length / this.width;
          const first = start;
          const last = end;
          let i;

          this.canvasContexts['waveform'].fillStyle = BAR_COLOR;
          for (i = first; i < last; i += step) {
            const peak = peaks[Math.floor(i * scale * peakIndexScale)] || 0;
            const h = Math.round((peak / 1) * halfH);
            this.canvasContexts['waveform'].fillRect(
              i + this.halfPixel,
              halfH - h + offsetY,
              bar + this.halfPixel,
              h * 2
            );
          }
          resolve();
        }
      );
    });
  }

  prepareDraw(peaks, start, end, fn) {
    return requestAnimationFrame(() => {
      // Bar wave draws the bottom only as a reflection of the top,
      // so we don't need negative values
      const hasMinVals = peaks.some((val) => val < 0);
      const height = HEIGHT - SPACING * 2 * this.pixelRatio;
      const offsetY = SPACING;
      const halfH = height / 2;

      return fn({
        hasMinVals: hasMinVals,
        height: height,
        offsetY: offsetY,
        halfH: halfH,
        peaks: peaks,
      });
    });
  }

  doSnapshot(canvas) {
    this.snapshots[canvas].push(
      this.canvasContexts[canvas].getImageData(0, 0, this.width, HEIGHT)
    );
  }

  setupContainer() {
    this.container = this.shadowRoot.getElementById('root');
    this.boundingClientRect = this.container.getBoundingClientRect();
    this.containerWidth = this.boundingClientRect.width;
    this.width = this.boundingClientRect.width - SPACING * 2;
  }

  setupCanvases() {
    this.canvasContexts = {};
    this.snapshots = {};
    this.canvases = this.container.querySelector('#canvases');
    Array.from(this.canvases.children).forEach((node) => {
      const canvas = node.id.replace('-canvas', '');
      this.canvases[canvas] = node;
      this.canvasContexts[canvas] = node.getContext('2d');
      this.canvasContexts[canvas].clearRect(0, 0, this.width, HEIGHT);
      this.canvasContexts[canvas].font = FONT;
      this.snapshots[canvas] = [];
    });
  }

  async play() {
    withMediaSession(() => {
      navigator.mediaSession.playbackState = 'playing';
    });
    try {
      await this.audio.play();
    } catch (err) {
      console.error(err);
      // Browser refuses to play audio from an ObjectURL...
      // Probably because of missing MIME type in `<source type="..."`>
      // Fallback to streaming remote audio.
      // /!\ Disabled for now, as using a <audio> element in render() w/ ref.
      // if (this.audio.src !== this.src && err.name.match(/NotSupportedError/)) {
      //   this.audio.removeEventListener(
      //     'timeupdate',
      //     this.handleSourceTimeUpdate,
      //     this.evtHandlerOptions
      //   );
      //   this.audio = new Audio(this.src);
      //   return this.play();
      // }
    }
    this.render();
  }

  pause() {
    withMediaSession(() => {
      navigator.mediaSession.playbackState = 'paused';
    });
    this.audio.pause();
    this.render();
  }

  setMediaMetaData() {
    const title = getDisplayName(this.file.name);
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
    });
    this.mediaMetadata = navigator.mediaSession.metadata;
  }

  togglePlayPause() {
    withMediaSession(() => {
      if (!this.mediaMetadata) {
        this.setMediaMetaData();
      }
      navigator.mediaSession.setActionHandler('play', this.play);
      navigator.mediaSession.setActionHandler('pause', this.pause);
    });

    if (this.audio.paused) {
      this.play();
    } else {
      this.pause();
    }
  }

  handlePlayPauseClick(evt) {
    evt.preventDefault();
    this.togglePlayPause();
  }

  render() {
    const disabled = !this.audio || undefined;
    const paused = !this.audio || this.audio.paused;
    const progress =
      disabled || !this.audioBuffer
        ? 0
        : Math.round((this.audio.currentTime / this.getDuration()) * 100);

    return this.renderer(html`
      <style>
        ${`
        * {
          box-sizing: border-box;
        }

        #root {
          width: 100%;
          max-width: ${CONTAINER_WIDTH}px;
          margin: 0 auto;
          margin-top: 150px;
          background-color: ${BACKGROUND_COLOR};
          border: 0;
          border-radius: ${SPACING}px;
          padding: ${SPACING}px 0;
          overflow-x: auto;
        }

        #canvases {
          position: relative;
          height: 100%;
        }

        canvas {
          position: absolute;
          top: ${SPACING}px;
          left: ${SPACING}px;
          background-color: transparent;
        }

        #progress-canvas:focus {
          outline: 0;
          box-shadow: ${SLICE_COLOR} 0 0 2px 2px;
        }
  
        #progress-canvas:focus:not(.focus-visible) {
          box-shadow: none;
        }

        #cursor-canvas {
          left: 0;
        }

        #controls {
          display: flex;
          justify-content: center;
        }

        button {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: transparent;
          border: 3px solid transparent;
          border-color: ${SLICE_COLOR};
        }

        button,
        button:hover,
        button:active,
        button:focus {
          outline: 0;
          box-shadow: none;
        }

        button:hover {
          background-color: rgba(${hexToRGB(BAR_COLOR)}, 0.6);
        }

        button:active {
          background-color: ${BAR_COLOR};
        }

        button:focus {
          box-shadow: ${SLICE_COLOR} 0 0 2px 2px;
        }

        button:focus:not(.focus-visible) {
          box-shadow: none;
        }

        #play-pause[data-state="play"] svg {
          margin-left: 3px;
        }
      `}
      </style>
      <div id="root" aria-label="Audio Player" role="region">
        ${this.audioBuffer &&
        html`
          <div id="canvases" style="${`max-height:${CONTAINER_HEIGHT}px`}">
            <canvas
              id="waveform-canvas"
              width="${this.width}"
              height="${HEIGHT}"
            />
            <canvas
              id="progress-canvas"
              width="${this.width}"
              height="${HEIGHT}"
              tabindex="0"
              aria-valuetext="seek audio keyboard slider"
              aria-valuemax="100"
              aria-valuemin="0"
              aria-valuenow=${progress}
              role="slider"
            />
            <canvas
              id="cursor-canvas"
              width="${this.containerWidth}"
              height="${HEIGHT}"
            />
          </div>
        `}
        <div id="controls">
          <button
            id="play-pause"
            disabled=${disabled}
            onclick=${this.handlePlayPauseClick}
            data-state=${!paused ? 'pause' : 'play'}
            aria-label=${!paused ? 'Pause' : 'Play'}
          >
            ${!paused ? Pause() : Play()}
          </button>
        </div>
        <audio ref=${this.audioRef}>
          ${this.objectURL && this.file
            ? html` <source src=${this.objectURL} type=${this.file.type} /> `
            : ''}
        </audio>
      </div>
    `);
  }
}

Object.defineProperty(AudioWaveformPlayer, 'observedAttributes', {
  configurable: true,
  enumerable: true,
  writable: true,
  value: ['src'],
});

export { AudioWaveformPlayer };
