import { svg, render, html } from 'uhtml';
import { getFileAudioBuffer as getFileAudioBuffer$1 } from '@soundcut/decode-audio-data-fast';
import { decode } from 'punycode';

const checkPassiveEventListener = (() => {
  let passiveSupported;
  return function checkPassiveEventListener_() {
    if (passiveSupported !== undefined) {
      return passiveSupported;
    }

    try {
      const options = {
        // eslint-disable-next-line getter-return
        get passive() {
          passiveSupported = true;
        },
      };

      window.addEventListener('test', options, options);
      window.removeEventListener('test', options, options);
    } catch (err) {
      passiveSupported = false;
    }

    return passiveSupported;
  };
})();

/**
 * Applies the :focus-visible polyfill at the given scope.
 * A scope in this case is either the top-level Document or a Shadow Root.
 *
 * @param {(Document|ShadowRoot)} scope
 * @see https://github.com/WICG/focus-visible
 */
function applyFocusVisiblePolyfill(scope) {
  var hadKeyboardEvent = true;
  var hadFocusVisibleRecently = false;
  var hadFocusVisibleRecentlyTimeout = null;

  var inputTypesAllowlist = {
    text: true,
    search: true,
    url: true,
    tel: true,
    email: true,
    password: true,
    number: true,
    date: true,
    month: true,
    week: true,
    time: true,
    datetime: true,
    'datetime-local': true,
  };

  /**
   * Helper function for legacy browsers and iframes which sometimes focus
   * elements like document, body, and non-interactive SVG.
   * @param {Element} el
   */
  function isValidFocusTarget(el) {
    if (
      el &&
      el !== document &&
      el.nodeName !== 'HTML' &&
      el.nodeName !== 'BODY' &&
      'classList' in el &&
      'contains' in el.classList
    ) {
      return true;
    }
    return false;
  }

  /**
   * Computes whether the given element should automatically trigger the
   * `focus-visible` class being added, i.e. whether it should always match
   * `:focus-visible` when focused.
   * @param {Element} el
   * @return {boolean}
   */
  function focusTriggersKeyboardModality(el) {
    var type = el.type;
    var tagName = el.tagName;

    if (tagName === 'INPUT' && inputTypesAllowlist[type] && !el.readOnly) {
      return true;
    }

    if (tagName === 'TEXTAREA' && !el.readOnly) {
      return true;
    }

    if (el.isContentEditable) {
      return true;
    }

    return false;
  }

  /**
   * Add the `focus-visible` class to the given element if it was not added by
   * the author.
   * @param {Element} el
   */
  function addFocusVisibleClass(el) {
    if (el.classList.contains('focus-visible')) {
      return;
    }
    el.classList.add('focus-visible');
    el.setAttribute('data-focus-visible-added', '');
  }

  /**
   * Remove the `focus-visible` class from the given element if it was not
   * originally added by the author.
   * @param {Element} el
   */
  function removeFocusVisibleClass(el) {
    if (!el.hasAttribute('data-focus-visible-added')) {
      return;
    }
    el.classList.remove('focus-visible');
    el.removeAttribute('data-focus-visible-added');
  }

  /**
   * If the most recent user interaction was via the keyboard;
   * and the key press did not include a meta, alt/option, or control key;
   * then the modality is keyboard. Otherwise, the modality is not keyboard.
   * Apply `focus-visible` to any current active element and keep track
   * of our keyboard modality state with `hadKeyboardEvent`.
   * @param {KeyboardEvent} e
   */
  function onKeyDown(e) {
    if (e.metaKey || e.altKey || e.ctrlKey) {
      return;
    }

    if (isValidFocusTarget(scope.activeElement)) {
      addFocusVisibleClass(scope.activeElement);
    }

    hadKeyboardEvent = true;
  }

  /**
   * If at any point a user clicks with a pointing device, ensure that we change
   * the modality away from keyboard.
   * This avoids the situation where a user presses a key on an already focused
   * element, and then clicks on a different element, focusing it with a
   * pointing device, while we still think we're in keyboard modality.
   * @param {Event} e
   */
  function onPointerDown(e) {
    hadKeyboardEvent = false;
  }

  /**
   * On `focus`, add the `focus-visible` class to the target if:
   * - the target received focus as a result of keyboard navigation, or
   * - the event target is an element that will likely require interaction
   *   via the keyboard (e.g. a text box)
   * @param {Event} e
   */
  function onFocus(e) {
    // Prevent IE from focusing the document or HTML element.
    if (!isValidFocusTarget(e.target)) {
      return;
    }

    if (hadKeyboardEvent || focusTriggersKeyboardModality(e.target)) {
      addFocusVisibleClass(e.target);
    }
  }

  /**
   * On `blur`, remove the `focus-visible` class from the target.
   * @param {Event} e
   */
  function onBlur(e) {
    if (!isValidFocusTarget(e.target)) {
      return;
    }

    if (
      e.target.classList.contains('focus-visible') ||
      e.target.hasAttribute('data-focus-visible-added')
    ) {
      // To detect a tab/window switch, we look for a blur event followed
      // rapidly by a visibility change.
      // If we don't see a visibility change within 100ms, it's probably a
      // regular focus change.
      hadFocusVisibleRecently = true;
      window.clearTimeout(hadFocusVisibleRecentlyTimeout);
      hadFocusVisibleRecentlyTimeout = window.setTimeout(function () {
        hadFocusVisibleRecently = false;
      }, 100);
      removeFocusVisibleClass(e.target);
    }
  }

  /**
   * If the user changes tabs, keep track of whether or not the previously
   * focused element had .focus-visible.
   * @param {Event} e
   */
  function onVisibilityChange(e) {
    if (document.visibilityState === 'hidden') {
      // If the tab becomes active again, the browser will handle calling focus
      // on the element (Safari actually calls it twice).
      // If this tab change caused a blur on an element with focus-visible,
      // re-apply the class when the user switches back to the tab.
      if (hadFocusVisibleRecently) {
        hadKeyboardEvent = true;
      }
      addInitialPointerMoveListeners();
    }
  }

  /**
   * Add a group of listeners to detect usage of any pointing devices.
   * These listeners will be added when the polyfill first loads, and anytime
   * the window is blurred, so that they are active when the window regains
   * focus.
   */
  function addInitialPointerMoveListeners() {
    document.addEventListener('mousemove', onInitialPointerMove);
    document.addEventListener('mousedown', onInitialPointerMove);
    document.addEventListener('mouseup', onInitialPointerMove);
    document.addEventListener('pointermove', onInitialPointerMove);
    document.addEventListener('pointerdown', onInitialPointerMove);
    document.addEventListener('pointerup', onInitialPointerMove);
    document.addEventListener('touchmove', onInitialPointerMove);
    document.addEventListener('touchstart', onInitialPointerMove);
    document.addEventListener('touchend', onInitialPointerMove);
  }

  function removeInitialPointerMoveListeners() {
    document.removeEventListener('mousemove', onInitialPointerMove);
    document.removeEventListener('mousedown', onInitialPointerMove);
    document.removeEventListener('mouseup', onInitialPointerMove);
    document.removeEventListener('pointermove', onInitialPointerMove);
    document.removeEventListener('pointerdown', onInitialPointerMove);
    document.removeEventListener('pointerup', onInitialPointerMove);
    document.removeEventListener('touchmove', onInitialPointerMove);
    document.removeEventListener('touchstart', onInitialPointerMove);
    document.removeEventListener('touchend', onInitialPointerMove);
  }

  /**
   * When the polfyill first loads, assume the user is in keyboard modality.
   * If any event is received from a pointing device (e.g. mouse, pointer,
   * touch), turn off keyboard modality.
   * This accounts for situations where focus enters the page from the URL bar.
   * @param {Event} e
   */
  function onInitialPointerMove(e) {
    // Work around a Safari quirk that fires a mousemove on <html> whenever the
    // window blurs, even if you're tabbing out of the page. ¯\_(ツ)_/¯
    if (e.target.nodeName && e.target.nodeName.toLowerCase() === 'html') {
      return;
    }

    hadKeyboardEvent = false;
    removeInitialPointerMoveListeners();
  }

  // For some kinds of state, we are interested in changes at the global scope
  // only. For example, global pointer input, global key presses and global
  // visibility change should affect the state at every scope:
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('mousedown', onPointerDown, true);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('touchstart', onPointerDown, true);
  document.addEventListener('visibilitychange', onVisibilityChange, true);

  addInitialPointerMoveListeners();

  // For focus and blur, we specifically care about state changes in the local
  // scope. This is because focus / blur events that originate from within a
  // shadow root are not re-dispatched from the host element if it was already
  // the active element in its own scope:
  scope.addEventListener('focus', onFocus, true);
  scope.addEventListener('blur', onBlur, true);

  // We detect that a node is a ShadowRoot by ensuring that it is a
  // DocumentFragment and also has a host property. This check covers native
  // implementation and polyfill implementation transparently. If we only cared
  // about the native implementation, we could just check if the scope was
  // an instance of a ShadowRoot.
  if (scope.nodeType === Node.DOCUMENT_FRAGMENT_NODE && scope.host) {
    // Since a ShadowRoot is a special kind of DocumentFragment, it does not
    // have a root element to add a class to. So, we add this attribute to the
    // host element instead:
    scope.host.setAttribute('data-js-focus-visible', '');
  } else if (scope.nodeType === Node.DOCUMENT_NODE) {
    document.documentElement.classList.add('js-focus-visible');
    document.documentElement.setAttribute('data-js-focus-visible', '');
  }
}

// It is important to wrap all references to global window and document in
// these checks to support server-side rendering use cases
// @see https://github.com/WICG/focus-visible/issues/199
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Make the polyfill helper globally available. This can be used as a signal
  // to interested libraries that wish to coordinate with the polyfill for e.g.,
  // applying the polyfill to a shadow root:
  window.applyFocusVisiblePolyfill = applyFocusVisiblePolyfill;

  // Notify interested libraries of the polyfill's presence, in case the
  // polyfill was loaded lazily:
  var event;

  try {
    event = new CustomEvent('focus-visible-polyfill-ready');
  } catch (error) {
    // IE11 does not support using CustomEvent as a constructor directly:
    event = document.createEvent('CustomEvent');
    event.initCustomEvent('focus-visible-polyfill-ready', false, false, {});
  }

  window.dispatchEvent(event);
}

function getFileArrayBuffer(file) {
  return new Promise((resolve) => {
    let fileReader = new FileReader();
    fileReader.onloadend = () => {
      resolve(fileReader.result);
    };
    fileReader.readAsArrayBuffer(file);
  });
}

function getFileAudioBuffer(file, audioCtx, opts) {
  return getFileAudioBuffer$1(file, audioCtx, opts).catch((err) => {
    // Unable to decode audio data fast.
    // Either because:
    // - the file is not MP3
    // - the browser does not support.. something?
    // Fallback to regular AudioBuffer.decodeAudioData()
    console.error(err);
    return getFileArrayBuffer(file);
  });
}

function humanizeDuration(duration, progress = null) {
  const dHumanized = [
    [Math.floor((duration % 3600) / 60), 'minute|s'],
    [('00' + Math.floor(duration % 60)).slice(-2), 'second|s'],
  ]
    .reduce((acc, curr) => {
      const parsed = Number.parseInt(curr);
      if (parsed) {
        acc.push(
          [
            curr[0],
            parsed > 1 ? curr[1].replace('|', '') : curr[1].split('|')[0],
          ].join(' ')
        );
      }
      return acc;
    }, [])
    .join(', ');

  if (Number.isNaN(Number.parseInt(progress))) {
    return dHumanized;
  }

  const pHumanized = `${progress}%`;
  return `${dHumanized} (${pHumanized})`;
}

function withMediaSession(fn) {
  if ('mediaSession' in navigator) {
    fn();
  }
}

function getDisplayName(str) {
  let ret = str;
  try {
    ret = decode(str);
  } catch (err) {
    // pass
  }

  return ret || 'Untitled';
}

async function fetchSource(url) {
  const fetchPromise = fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'audio/*',
    },
  });

  try {
    const response = await fetchPromise;
    if (response) {
      if (response.status !== 200) {
        const error = new Error('Unable to fetch source');
        error.response = response;
        throw error;
      }
    }

    const blob = await response.blob();
    let filename = 'Untitled';
    try {
      filename = response.headers
        .get('content-disposition')
        .match(/filename="(.+)"/)[1];
    } catch (err) {
      // pass
    }
    return new File([blob], filename, {
      type: (response.headers.get('content-type') || '').split(';')[0],
    });
  } catch (err) {
    console.error({ err });
    throw err;
  }
}

function formatTime(time) {
  return [
    Math.floor((time % 3600) / 60), // minutes
    ('00' + Math.floor(time % 60)).slice(-2), // seconds
    ('00' + Math.floor((time % 1) * 100)).slice(-2), // tenth miliseconds
  ].join(':');
}

function hexToRGB(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
  ];
}

function Play() {
  return svg`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#37f0c2"
      stroke-width="2"
      stroke-linecap="square"
      stroke-linejoin="arcs"
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  `;
}

function Cross() {
  return svg`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#f4ffdc"
      stroke-width="2"
      stroke-linecap="square"
      stroke-linejoin="arcs"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  `;
}

function Pause(id = 'default') {
  return svg`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#37f0c2"
      stroke-width="2"
      stroke-linecap="square"
      stroke-linejoin="arcs"
    >
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  `;
}

const SPACING = 20;
const CONTAINER_WIDTH = 900;
const CONTAINER_HEIGHT = 260;
const HEIGHT = CONTAINER_HEIGHT - SPACING * 2;
const BAR_WIDTH = 4;
const BAR_HANDLE_RADIUS = 8;
const BAR_CENTER = (BAR_WIDTH - 1) / 2;
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
      1  ;
    this.halfPixel = 0.5 / this.pixelRatio;

    this.supportsPassiveEventListener = checkPassiveEventListener();
    this.evtHandlerOptions = this.supportsPassiveEventListener
      ? { passive: true }
      : true;
  }

  get src() {
    return this.getAttribute('src');
  }

  attributeChangedCallback(name, prev, curr) {
    if (name === 'src' && prev) {
      this.disconnectedCallback();
      this.connectedCallback();
    }
  }

  disconnectedCallback() {
    this.audio.removeEventListener(
      'timeupdate',
      this.handleSourceTimeUpdate,
      this.evtHandlerOptions
    );

    this.container.removeEventListener(
      'mousedown',
      this.handleMouseDown,
      this.evtHandlerOptions
    );
    this.container.removeEventListener(
      'touchstart',
      this.handleMouseDown,
      this.evtHandlerOptions
    );

    this.container.removeEventListener(
      'mousemove',
      this.handleMouseMove,
      this.evtHandlerOptions
    );
    this.container.removeEventListener(
      'touchmove',
      this.handleMouseMove,
      this.evtHandlerOptions
    );

    this.audioBuffer = undefined;
    this.file = undefined;
    this.objectUrl = undefined;
    this.audioCtx = undefined;
    this.audio = undefined;
    this.error = undefined;
  }

  async connectedCallback() {
    if (!this.hasAttribute('data-js-focus-visible')) {
      applyFocusVisiblePolyfill(this.shadowRoot);
    }

    this.audioKey = new String(this.src);

    this.render();
    this.setupContainer();

    try {
      if (!this.src) {
        throw new Error(
          '<waveform-player> must be given a valid `src` attribute.'
        );
      }
      this.file = await fetchSource(this.src);
      this.objectURL = URL.createObjectURL(this.file);

      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.audioBuffer = await getFileAudioBuffer(this.file, this.audioCtx);
    } catch (err) {
      console.error(err);
      this.disconnectedCallback();
      this.error = err;
      this.render();
      return;
    }

    this.onAudioDecoded();
  }

  audioRef(audio) {
    if (audio && audio !== this.audio) {
      this.audio = audio;
      this.audio.addEventListener(
        'timeupdate',
        this.handleSourceTimeUpdate,
        this.evtHandlerOptions
      );
      this.render();
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
          const gap =  0;
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

  setupContainer() {
    this.container = this.shadowRoot.getElementById('root');
    this.boundingClientRect = this.container.getBoundingClientRect();
    this.containerWidth = this.boundingClientRect.width;
    this.width = this.boundingClientRect.width - SPACING * 2;
  }

  setupCanvases() {
    this.canvasContexts = {};
    this.canvases = this.container.querySelector('#canvases');
    Array.from(this.canvases.children).forEach((node) => {
      const canvas = node.id.replace('-canvas', '');
      this.canvases[canvas] = node;
      this.canvasContexts[canvas] = node.getContext('2d');
      this.canvasContexts[canvas].clearRect(0, 0, this.width, HEIGHT);
      this.canvasContexts[canvas].font = FONT;
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
      this.error = err;
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
    const humanProgress =
      progress === 0
        ? 'Beginning'
        : progress === 100
        ? 'End'
        : humanizeDuration(this.audio.currentTime, progress);

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

        p {
          padding: ${SPACING}px;
          font-family: system-ui, sans-serif;
          font-size: 1.5rem;
        }

        .error {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: #cc0000;
          color: #f4ffdc;
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
        ${this.error &&
        html`<p class="error">
          <span>
            <strong>Unable to retrieve or play audio file.</strong>
            <br />
            ${`${this.error.name}: ${this.error.message}`}
          </span>
          ${Cross()}
        </p>`}
        ${this.audioBuffer &&
        html`
          <div id="canvases" style="${`max-height:${CONTAINER_HEIGHT}px`}">
            <canvas
              id="waveform-canvas"
              width="${this.width}"
              height="${HEIGHT}"
              aria-hidden="true"
            />
            <canvas
              id="progress-canvas"
              width="${this.width}"
              height="${HEIGHT}"
              tabindex="0"
              role="slider"
              aria-label="Seek audio to a specific time"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow=${progress}
              aria-valuetext=${humanProgress}
            />
            <canvas
              id="cursor-canvas"
              aria-hidden="true"
              width="${this.containerWidth}"
              height="${HEIGHT}"
            />
          </div>
        `}
        ${this.audio &&
        html`
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
        `}
        ${html.for(this.audioKey)`
          <audio ref=${this.audioRef} tabindex="-1" style="display: none;">
            ${
              this.objectURL &&
              this.file &&
              html` <source src=${this.objectURL} type=${this.file.type} /> `
            }
          </audio>
        `}
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

customElements.define('waveform-player', AudioWaveformPlayer);
//# sourceMappingURL=audio-waveform-player-element.esm.js.map
