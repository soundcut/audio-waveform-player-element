(function (factory) {
  typeof define === 'function' && define.amd ? define(factory) :
  factory();
}((function () { 'use strict';

  var umap = _ => ({
    // About: get: _.get.bind(_)
    // It looks like WebKit/Safari didn't optimize bind at all,
    // so that using bind slows it down by 60%.
    // Firefox and Chrome are just fine in both cases,
    // so let's use the approach that works fast everywhere 👍
    get: key => _.get(key),
    set: (key, value) => (_.set(key, value), value)
  });

  const attr = /([^\s\\>"'=]+)\s*=\s*(['"]?)$/;
  const empty = /^(?:area|base|br|col|embed|hr|img|input|keygen|link|menuitem|meta|param|source|track|wbr)$/i;
  const node = /<[a-z][^>]+$/i;
  const notNode = />[^<>]*$/;
  const selfClosing = /<([a-z]+[a-z0-9:._-]*)([^>]*?)(\/>)/ig;
  const trimEnd = /\s+$/;

  const isNode = (template, i) => (
      0 < i-- && (
      node.test(template[i]) || (
        !notNode.test(template[i]) && isNode(template, i)
      )
    )
  );

  const regular = (original, name, extra) => empty.test(name) ?
                    original : `<${name}${extra.replace(trimEnd,'')}></${name}>`;

  var instrument = (template, prefix, svg) => {
    const text = [];
    const {length} = template;
    for (let i = 1; i < length; i++) {
      const chunk = template[i - 1];
      text.push(attr.test(chunk) && isNode(template, i) ?
        chunk.replace(
          attr,
          (_, $1, $2) => `${prefix}${i - 1}=${$2 || '"'}${$1}${$2 ? '' : '"'}`
        ) :
        `${chunk}<!--${prefix}${i - 1}-->`
      );
    }
    text.push(template[length - 1]);
    const output = text.join('').trim();
    return svg ? output : output.replace(selfClosing, regular);
  };

  const {isArray} = Array;
  const {indexOf, slice} = [];

  const ELEMENT_NODE = 1;
  const nodeType = 111;

  const remove = ({firstChild, lastChild}) => {
    const range = document.createRange();
    range.setStartAfter(firstChild);
    range.setEndAfter(lastChild);
    range.deleteContents();
    return firstChild;
  };

  const diffable = (node, operation) => node.nodeType === nodeType ?
    ((1 / operation) < 0 ?
      (operation ? remove(node) : node.lastChild) :
      (operation ? node.valueOf() : node.firstChild)) :
    node
  ;

  const persistent = fragment => {
    const {childNodes} = fragment;
    const {length} = childNodes;
    if (length < 2)
      return length ? childNodes[0] : fragment;
    const nodes = slice.call(childNodes, 0);
    const firstChild = nodes[0];
    const lastChild = nodes[length - 1];
    return {
      ELEMENT_NODE,
      nodeType,
      firstChild,
      lastChild,
      valueOf() {
        if (childNodes.length !== length) {
          let i = 0;
          while (i < length)
            fragment.appendChild(nodes[i++]);
        }
        return fragment;
      }
    };
  };

  /**
   * ISC License
   *
   * Copyright (c) 2020, Andrea Giammarchi, @WebReflection
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
   * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
   * AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
   * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
   * LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE
   * OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
   * PERFORMANCE OF THIS SOFTWARE.
   */

  /**
   * @param {Node} parentNode The container where children live
   * @param {Node[]} a The list of current/live children
   * @param {Node[]} b The list of future children
   * @param {(entry: Node, action: number) => Node} get
   * The callback invoked per each entry related DOM operation.
   * @param {Node} [before] The optional node used as anchor to insert before.
   * @returns {Node[]} The same list of future children.
   */
  var udomdiff = (parentNode, a, b, get, before) => {
    const bLength = b.length;
    let aEnd = a.length;
    let bEnd = bLength;
    let aStart = 0;
    let bStart = 0;
    let map = null;
    while (aStart < aEnd || bStart < bEnd) {
      // append head, tail, or nodes in between: fast path
      if (aEnd === aStart) {
        // we could be in a situation where the rest of nodes that
        // need to be added are not at the end, and in such case
        // the node to `insertBefore`, if the index is more than 0
        // must be retrieved, otherwise it's gonna be the first item.
        const node = bEnd < bLength ?
          (bStart ?
            (get(b[bStart - 1], -0).nextSibling) :
            get(b[bEnd - bStart], 0)) :
          before;
        while (bStart < bEnd)
          parentNode.insertBefore(get(b[bStart++], 1), node);
      }
      // remove head or tail: fast path
      else if (bEnd === bStart) {
        while (aStart < aEnd) {
          // remove the node only if it's unknown or not live
          if (!map || !map.has(a[aStart]))
            parentNode.removeChild(get(a[aStart], -1));
          aStart++;
        }
      }
      // same node: fast path
      else if (a[aStart] === b[bStart]) {
        aStart++;
        bStart++;
      }
      // same tail: fast path
      else if (a[aEnd - 1] === b[bEnd - 1]) {
        aEnd--;
        bEnd--;
      }
      // The once here single last swap "fast path" has been removed in v1.1.0
      // https://github.com/WebReflection/udomdiff/blob/single-final-swap/esm/index.js#L69-L85
      // reverse swap: also fast path
      else if (
        a[aStart] === b[bEnd - 1] &&
        b[bStart] === a[aEnd - 1]
      ) {
        // this is a "shrink" operation that could happen in these cases:
        // [1, 2, 3, 4, 5]
        // [1, 4, 3, 2, 5]
        // or asymmetric too
        // [1, 2, 3, 4, 5]
        // [1, 2, 3, 5, 6, 4]
        const node = get(a[--aEnd], -1).nextSibling;
        parentNode.insertBefore(
          get(b[bStart++], 1),
          get(a[aStart++], -1).nextSibling
        );
        parentNode.insertBefore(get(b[--bEnd], 1), node);
        // mark the future index as identical (yeah, it's dirty, but cheap 👍)
        // The main reason to do this, is that when a[aEnd] will be reached,
        // the loop will likely be on the fast path, as identical to b[bEnd].
        // In the best case scenario, the next loop will skip the tail,
        // but in the worst one, this node will be considered as already
        // processed, bailing out pretty quickly from the map index check
        a[aEnd] = b[bEnd];
      }
      // map based fallback, "slow" path
      else {
        // the map requires an O(bEnd - bStart) operation once
        // to store all future nodes indexes for later purposes.
        // In the worst case scenario, this is a full O(N) cost,
        // and such scenario happens at least when all nodes are different,
        // but also if both first and last items of the lists are different
        if (!map) {
          map = new Map;
          let i = bStart;
          while (i < bEnd)
            map.set(b[i], i++);
        }
        // if it's a future node, hence it needs some handling
        if (map.has(a[aStart])) {
          // grab the index of such node, 'cause it might have been processed
          const index = map.get(a[aStart]);
          // if it's not already processed, look on demand for the next LCS
          if (bStart < index && index < bEnd) {
            let i = aStart;
            // counts the amount of nodes that are the same in the future
            let sequence = 1;
            while (++i < aEnd && i < bEnd && map.get(a[i]) === (index + sequence))
              sequence++;
            // effort decision here: if the sequence is longer than replaces
            // needed to reach such sequence, which would brings again this loop
            // to the fast path, prepend the difference before a sequence,
            // and move only the future list index forward, so that aStart
            // and bStart will be aligned again, hence on the fast path.
            // An example considering aStart and bStart are both 0:
            // a: [1, 2, 3, 4]
            // b: [7, 1, 2, 3, 6]
            // this would place 7 before 1 and, from that time on, 1, 2, and 3
            // will be processed at zero cost
            if (sequence > (index - bStart)) {
              const node = get(a[aStart], 0);
              while (bStart < index)
                parentNode.insertBefore(get(b[bStart++], 1), node);
            }
            // if the effort wasn't good enough, fallback to a replace,
            // moving both source and target indexes forward, hoping that some
            // similar node will be found later on, to go back to the fast path
            else {
              parentNode.replaceChild(
                get(b[bStart++], 1),
                get(a[aStart++], -1)
              );
            }
          }
          // otherwise move the source forward, 'cause there's nothing to do
          else
            aStart++;
        }
        // this node has no meaning in the future list, so it's more than safe
        // to remove it, and check the next live node out instead, meaning
        // that only the live list index should be forwarded
        else
          parentNode.removeChild(get(a[aStart++], -1));
      }
    }
    return b;
  };

  const aria = node => values => {
    for (const key in values) {
      const name = key === 'role' ? key : `aria-${key}`;
      const value = values[key];
      if (value == null)
        node.removeAttribute(name);
      else
        node.setAttribute(name, value);
    }
  };

  const attribute = (node, name) => {
    let oldValue, orphan = true;
    const attributeNode = document.createAttributeNS(null, name);
    return newValue => {
      if (oldValue !== newValue) {
        oldValue = newValue;
        if (oldValue == null) {
          if (!orphan) {
            node.removeAttributeNode(attributeNode);
            orphan = true;
          }
        }
        else {
          attributeNode.value = newValue;
          if (orphan) {
            node.setAttributeNodeNS(attributeNode);
            orphan = false;
          }
        }
      }
    };
  };

  const data = ({dataset}) => values => {
    for (const key in values) {
      const value = values[key];
      if (value == null)
        delete dataset[key];
      else
        dataset[key] = value;
    }
  };

  const event = (node, name) => {
    let oldValue, type = name.slice(2);
    if (!(name in node) && name.toLowerCase() in node)
      type = type.toLowerCase();
    return newValue => {
      const info = isArray(newValue) ? newValue : [newValue, false];
      if (oldValue !== info[0]) {
        if (oldValue)
          node.removeEventListener(type, oldValue, info[1]);
        if (oldValue = info[0])
          node.addEventListener(type, oldValue, info[1]);
      }
    };
  };

  const ref = node => value => {
    if (typeof value === 'function')
      value(node);
    else
      value.current = node;
  };

  const setter = (node, key) => value => {
    node[key] = value;
  };

  const text = node => {
    let oldValue;
    return newValue => {
      if (oldValue != newValue) {
        oldValue = newValue;
        node.textContent = newValue == null ? '' : newValue;
      }
    };
  };

  /*! (c) Andrea Giammarchi - ISC */
  var createContent = (function (document) {  var FRAGMENT = 'fragment';
    var TEMPLATE = 'template';
    var HAS_CONTENT = 'content' in create(TEMPLATE);

    var createHTML = HAS_CONTENT ?
      function (html) {
        var template = create(TEMPLATE);
        template.innerHTML = html;
        return template.content;
      } :
      function (html) {
        var content = create(FRAGMENT);
        var template = create(TEMPLATE);
        var childNodes = null;
        if (/^[^\S]*?<(col(?:group)?|t(?:head|body|foot|r|d|h))/i.test(html)) {
          var selector = RegExp.$1;
          template.innerHTML = '<table>' + html + '</table>';
          childNodes = template.querySelectorAll(selector);
        } else {
          template.innerHTML = html;
          childNodes = template.childNodes;
        }
        append(content, childNodes);
        return content;
      };

    return function createContent(markup, type) {
      return (type === 'svg' ? createSVG : createHTML)(markup);
    };

    function append(root, childNodes) {
      var length = childNodes.length;
      while (length--)
        root.appendChild(childNodes[0]);
    }

    function create(element) {
      return element === FRAGMENT ?
        document.createDocumentFragment() :
        document.createElementNS('http://www.w3.org/1999/xhtml', element);
    }

    // it could use createElementNS when hasNode is there
    // but this fallback is equally fast and easier to maintain
    // it is also battle tested already in all IE
    function createSVG(svg) {
      var content = create(FRAGMENT);
      var template = create('div');
      template.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">' + svg + '</svg>';
      append(content, template.firstChild.childNodes);
      return content;
    }

  }(document));

  // from a generic path, retrieves the exact targeted node
  const reducePath = ({childNodes}, i) => childNodes[i];

  // from a fragment container, create an array of indexes
  // related to its child nodes, so that it's possible
  // to retrieve later on exact node via reducePath
  const createPath = node => {
    const path = [];
    let {parentNode} = node;
    while (parentNode) {
      path.push(indexOf.call(parentNode.childNodes, node));
      node = parentNode;
      parentNode = node.parentNode;
    }
    return path;
  };

  const {createTreeWalker, importNode} = document;

  // this "hack" tells the library if the browser is IE11 or old Edge
  const IE = importNode.length != 1;

  // IE11 and old Edge discard empty nodes when cloning, potentially
  // resulting in broken paths to find updates. The workaround here
  // is to import once, upfront, the fragment that will be cloned
  // later on, so that paths are retrieved from one already parsed,
  // hence without missing child nodes once re-cloned.
  const createFragment = IE ?
    (text, type) => importNode.call(
      document,
      createContent(text, type),
      true
    ) :
    createContent;

  // IE11 and old Edge have a different createTreeWalker signature that
  // has been deprecated in other browsers. This export is needed only
  // to guarantee the TreeWalker doesn't show warnings and, ultimately, works
  const createWalker = IE ?
    fragment => createTreeWalker.call(document, fragment, 1 | 128, null, false) :
    fragment => createTreeWalker.call(document, fragment, 1 | 128);

  // this helper avoid code bloat around handleAnything() callback
  const diff = (comment, oldNodes, newNodes) => udomdiff(
    comment.parentNode,
    // TODO: there is a possible edge case where a node has been
    //       removed manually, or it was a keyed one, attached
    //       to a shared reference between renders.
    //       In this case udomdiff might fail at removing such node
    //       as its parent won't be the expected one.
    //       The best way to avoid this issue is to filter oldNodes
    //       in search of those not live, or not in the current parent
    //       anymore, but this would require both a change to uwire,
    //       exposing a parentNode from the firstChild, as example,
    //       but also a filter per each diff that should exclude nodes
    //       that are not in there, penalizing performance quite a lot.
    //       As this has been also a potential issue with domdiff,
    //       and both lighterhtml and hyperHTML might fail with this
    //       very specific edge case, I might as well document this possible
    //       "diffing shenanigan" and call it a day.
    oldNodes,
    newNodes,
    diffable,
    comment
  );

  // if an interpolation represents a comment, the whole
  // diffing will be related to such comment.
  // This helper is in charge of understanding how the new
  // content for such interpolation/hole should be updated
  const handleAnything = comment => {
    let oldValue, text, nodes = [];
    const anyContent = newValue => {
      switch (typeof newValue) {
        // primitives are handled as text content
        case 'string':
        case 'number':
        case 'boolean':
          if (oldValue !== newValue) {
            oldValue = newValue;
            if (text)
              text.textContent = newValue;
            else
              text = document.createTextNode(newValue);
            nodes = diff(comment, nodes, [text]);
          }
          break;
        // null, and undefined are used to cleanup previous content
        case 'object':
        case 'undefined':
          if (newValue == null) {
            if (oldValue != newValue) {
              oldValue = newValue;
              nodes = diff(comment, nodes, []);
            }
            break;
          }
          // arrays and nodes have a special treatment
          if (isArray(newValue)) {
            oldValue = newValue;
            // arrays can be used to cleanup, if empty
            if (newValue.length === 0)
              nodes = diff(comment, nodes, []);
            // or diffed, if these contains nodes or "wires"
            else if (typeof newValue[0] === 'object')
              nodes = diff(comment, nodes, newValue);
            // in all other cases the content is stringified as is
            else
              anyContent(String(newValue));
            break;
          }
          // if the new value is a DOM node, or a wire, and it's
          // different from the one already live, then it's diffed.
          // if the node is a fragment, it's appended once via its childNodes
          // There is no `else` here, meaning if the content
          // is not expected one, nothing happens, as easy as that.
          if ('ELEMENT_NODE' in newValue && oldValue !== newValue) {
            oldValue = newValue;
            nodes = diff(
              comment,
              nodes,
              newValue.nodeType === 11 ?
                slice.call(newValue.childNodes) :
                [newValue]
            );
          }
      }
    };
    return anyContent;
  };

  // attributes can be:
  //  * ref=${...}      for hooks and other purposes
  //  * aria=${...}     for aria attributes
  //  * .dataset=${...} for dataset related attributes
  //  * .setter=${...}  for Custom Elements setters or nodes with setters
  //                    such as buttons, details, options, select, etc
  //  * onevent=${...}  to automatically handle event listeners
  //  * generic=${...}  to handle an attribute just like an attribute
  const handleAttribute = (node, name/*, svg*/) => {
    if (name === 'ref')
      return ref(node);

    if (name === 'aria')
      return aria(node);

    if (name === '.dataset')
      return data(node);

    if (name.slice(0, 1) === '.')
      return setter(node, name.slice(1));

    if (name.slice(0, 2) === 'on')
      return event(node, name);

    return attribute(node, name/*, svg*/);
  };

  // each mapped update carries the update type and its path
  // the type is either node, attribute, or text, while
  // the path is how to retrieve the related node to update.
  // In the attribute case, the attribute name is also carried along.
  function handlers(options) {
    const {type, path} = options;
    const node = path.reduceRight(reducePath, this);
    return type === 'node' ?
      handleAnything(node) :
      (type === 'attr' ?
        handleAttribute(node, options.name/*, options.svg*/) :
        text(node));
  }

  // the prefix is used to identify either comments, attributes, or nodes
  // that contain the related unique id. In the attribute cases
  // isµX="attribute-name" will be used to map current X update to that
  // attribute name, while comments will be like <!--isµX-->, to map
  // the update to that specific comment node, hence its parent.
  // style and textarea will have <!--isµX--> text content, and are handled
  // directly through text-only updates.
  const prefix = 'isµ';

  // Template Literals are unique per scope and static, meaning a template
  // should be parsed once, and once only, as it will always represent the same
  // content, within the exact same amount of updates each time.
  // This cache relates each template to its unique content and updates.
  const cache = umap(new WeakMap);

  const createCache = () => ({
    stack: [],    // each template gets a stack for each interpolation "hole"

    entry: null,  // each entry contains details, such as:
                  //  * the template that is representing
                  //  * the type of node it represents (html or svg)
                  //  * the content fragment with all nodes
                  //  * the list of updates per each node (template holes)
                  //  * the "wired" node or fragment that will get updates
                  // if the template or type are different from the previous one
                  // the entry gets re-created each time

    wire: null    // each rendered node represent some wired content and
                  // this reference to the latest one. If different, the node
                  // will be cleaned up and the new "wire" will be appended
  });

  // the entry stored in the rendered node cache, and per each "hole"
  const createEntry = (type, template) => {
    const {content, updates} = mapUpdates(type, template);
    return {type, template, content, updates, wire: null};
  };

  // a template is instrumented to be able to retrieve where updates are needed.
  // Each unique template becomes a fragment, cloned once per each other
  // operation based on the same template, i.e. data => html`<p>${data}</p>`
  const mapTemplate = (type, template) => {
    const text = instrument(template, prefix, type === 'svg');
    const content = createFragment(text, type);
    // once instrumented and reproduced as fragment, it's crawled
    // to find out where each update is in the fragment tree
    const tw = createWalker(content);
    const nodes = [];
    const length = template.length - 1;
    let i = 0;
    // updates are searched via unique names, linearly increased across the tree
    // <div isµ0="attr" isµ1="other"><!--isµ2--><style><!--isµ3--</style></div>
    let search = `${prefix}${i}`;
    while (i < length) {
      const node = tw.nextNode();
      // if not all updates are bound but there's nothing else to crawl
      // it means that there is something wrong with the template.
      if (!node)
        throw `bad template: ${text}`;
      // if the current node is a comment, and it contains isµX
      // it means the update should take care of any content
      if (node.nodeType === 8) {
        // The only comments to be considered are those
        // which content is exactly the same as the searched one.
        if (node.textContent === search) {
          nodes.push({type: 'node', path: createPath(node)});
          search = `${prefix}${++i}`;
        }
      }
      else {
        // if the node is not a comment, loop through all its attributes
        // named isµX and relate attribute updates to this node and the
        // attribute name, retrieved through node.getAttribute("isµX")
        // the isµX attribute will be removed as irrelevant for the layout
        // let svg = -1;
        while (node.hasAttribute(search)) {
          nodes.push({
            type: 'attr',
            path: createPath(node),
            name: node.getAttribute(search),
            //svg: svg < 0 ? (svg = ('ownerSVGElement' in node ? 1 : 0)) : svg
          });
          node.removeAttribute(search);
          search = `${prefix}${++i}`;
        }
        // if the node was a style or a textarea one, check its content
        // and if it is <!--isµX--> then update tex-only this node
        if (
          /^(?:style|textarea)$/i.test(node.tagName) &&
          node.textContent.trim() === `<!--${search}-->`
        ){
          nodes.push({type: 'text', path: createPath(node)});
          search = `${prefix}${++i}`;
        }
      }
    }
    // once all nodes to update, or their attributes, are known, the content
    // will be cloned in the future to represent the template, and all updates
    // related to such content retrieved right away without needing to re-crawl
    // the exact same template, and its content, more than once.
    return {content, nodes};
  };

  // if a template is unknown, perform the previous mapping, otherwise grab
  // its details such as the fragment with all nodes, and updates info.
  const mapUpdates = (type, template) => {
    const {content, nodes} = (
      cache.get(template) ||
      cache.set(template, mapTemplate(type, template))
    );
    // clone deeply the fragment
    const fragment = importNode.call(document, content, true);
    // and relate an update handler per each node that needs one
    const updates = nodes.map(handlers, fragment);
    // return the fragment and all updates to use within its nodes
    return {content: fragment, updates};
  };

  // as html and svg can be nested calls, but no parent node is known
  // until rendered somewhere, the unroll operation is needed to
  // discover what to do with each interpolation, which will result
  // into an update operation.
  const unroll = (info, {type, template, values}) => {
    const {length} = values;
    // interpolations can contain holes and arrays, so these need
    // to be recursively discovered
    unrollValues(info, values, length);
    let {entry} = info;
    // if the cache entry is either null or different from the template
    // and the type this unroll should resolve, create a new entry
    // assigning a new content fragment and the list of updates.
    if (!entry || (entry.template !== template || entry.type !== type))
      info.entry = (entry = createEntry(type, template));
    const {content, updates, wire} = entry;
    // even if the fragment and its nodes is not live yet,
    // it is already possible to update via interpolations values.
    for (let i = 0; i < length; i++)
      updates[i](values[i]);
    // if the entry was new, or representing a different template or type,
    // create a new persistent entity to use during diffing.
    // This is simply a DOM node, when the template has a single container,
    // as in `<p></p>`, or a "wire" in `<p></p><p></p>` and similar cases.
    return wire || (entry.wire = persistent(content));
  };

  // the stack retains, per each interpolation value, the cache
  // related to each interpolation value, or null, if the render
  // was conditional and the value is not special (Array or Hole)
  const unrollValues = ({stack}, values, length) => {
    for (let i = 0; i < length; i++) {
      const hole = values[i];
      // each Hole gets unrolled and re-assigned as value
      // so that domdiff will deal with a node/wire, not with a hole
      if (hole instanceof Hole)
        values[i] = unroll(
          stack[i] || (stack[i] = createCache()),
          hole
        );
      // arrays are recursively resolved so that each entry will contain
      // also a DOM node or a wire, hence it can be diffed if/when needed
      else if (isArray(hole))
        unrollValues(
          stack[i] || (stack[i] = createCache()),
          hole,
          hole.length
        );
      // if the value is nothing special, the stack doesn't need to retain data
      // this is useful also to cleanup previously retained data, if the value
      // was a Hole, or an Array, but not anymore, i.e.:
      // const update = content => html`<div>${content}</div>`;
      // update(listOfItems); update(null); update(html`hole`)
      else
        stack[i] = null;
    }
    if (length < stack.length)
      stack.splice(length);
  };

  /**
   * Holds all details wrappers needed to render the content further on.
   * @constructor
   * @param {string} type The hole type, either `html` or `svg`.
   * @param {string[]} template The template literals used to the define the content.
   * @param {Array} values Zero, one, or more interpolated values to render.
   */
  function Hole(type, template, values) {
    this.type = type;
    this.template = template;
    this.values = values;
  }

  const {create, defineProperties} = Object;

  // both `html` and `svg` template literal tags are polluted
  // with a `for(ref[, id])` and a `node` tag too
  const tag = type => {
    // both `html` and `svg` tags have their own cache
    const keyed = umap(new WeakMap);
    // keyed operations always re-use the same cache and unroll
    // the template and its interpolations right away
    const fixed = cache => (template, ...values) => unroll(
      cache,
      {type, template, values}
    );
    return defineProperties(
      // non keyed operations are recognized as instance of Hole
      // during the "unroll", recursively resolved and updated
      (template, ...values) => new Hole(type, template, values),
      {
        for: {
          // keyed operations need a reference object, usually the parent node
          // which is showing keyed results, and optionally a unique id per each
          // related node, handy with JSON results and mutable list of objects
          // that usually carry a unique identifier
          value(ref, id) {
            const memo = keyed.get(ref) || keyed.set(ref, create(null));
            return memo[id] || (memo[id] = fixed(createCache()));
          }
        },
        node: {
          // it is possible to create one-off content out of the box via node tag
          // this might return the single created node, or a fragment with all
          // nodes present at the root level and, of course, their child nodes
          value: (template, ...values) => unroll(
            createCache(),
            {type, template, values}
          ).valueOf()
        }
      }
    );
  };

  // each rendered node gets its own cache
  const cache$1 = umap(new WeakMap);

  // rendering means understanding what `html` or `svg` tags returned
  // and it relates a specific node to its own unique cache.
  // Each time the content to render changes, the node is cleaned up
  // and the new new content is appended, and if such content is a Hole
  // then it's "unrolled" to resolve all its inner nodes.
  const render = (where, what) => {
    const hole = typeof what === 'function' ? what() : what;
    const info = cache$1.get(where) || cache$1.set(where, createCache());
    const wire = hole instanceof Hole ? unroll(info, hole) : hole;
    if (wire !== info.wire) {
      info.wire = wire;
      where.textContent = '';
      // valueOf() simply returns the node itself, but in case it was a "wire"
      // it will eventually re-append all nodes to its fragment so that such
      // fragment can be re-appended many times in a meaningful way
      // (wires are basically persistent fragments facades with special behavior)
      where.appendChild(wire.valueOf());
    }
    return where;
  };

  const html = tag('html');
  const svg = tag('svg');

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
    var event$1;

    try {
      event$1 = new CustomEvent('focus-visible-polyfill-ready');
    } catch (error) {
      // IE11 does not support using CustomEvent as a constructor directly:
      event$1 = document.createEvent('CustomEvent');
      event$1.initCustomEvent('focus-visible-polyfill-ready', false, false, {});
    }

    window.dispatchEvent(event$1);
  }

  var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

  function createCommonjsModule(fn, basedir, module) {
  	return module = {
  	  path: basedir,
  	  exports: {},
  	  require: function (path, base) {
        return commonjsRequire(path, (base === undefined || base === null) ? module.path : base);
      }
  	}, fn(module, module.exports), module.exports;
  }

  function commonjsRequire () {
  	throw new Error('Dynamic requires are not currently supported by @rollup/plugin-commonjs');
  }

  var lib = createCommonjsModule(function (module, exports) {
  //     mp3-parser/lib v0.3.0

  //     https://github.com/biril/mp3-parser
  //     Licensed and freely distributed under the MIT License
  //     Copyright (c) 2013-2016 Alex Lambiris

  // ----

  /* jshint browser:true */
  /* global exports:false, define:false */
  (function (globalObject, createModule) {

      // Global `exports` object signifies CommonJS enviroments with `module.exports`, e.g. Node
      { return createModule(exports); }
  }(commonjsGlobal, function (lib) {

      // Produce octet's binary representation as a string
      var octetToBinRep = (function () {
          var b = []; // The binary representation
          return function (octet) {
              b[0] = ((octet & 128) === 128 ? "1" : "0");
              b[1] = ((octet & 64)  === 64  ? "1" : "0");
              b[2] = ((octet & 32)  === 32  ? "1" : "0");
              b[3] = ((octet & 16)  === 16  ? "1" : "0");
              b[4] = ((octet & 8)   === 8   ? "1" : "0");
              b[5] = ((octet & 4)   === 4   ? "1" : "0");
              b[6] = ((octet & 2)   === 2   ? "1" : "0");
              b[7] = ((octet & 1)   === 1   ? "1" : "0");
              return b.join("");
          };
      }());

      // Get the number of bytes in a frame given its `bitrate`, `samplingRate` and `padding`.
      //  Based on [magic formula](http://mpgedit.org/mpgedit/mpeg_format/mpeghdr.htm)
      lib.getFrameByteLength = function (kbitrate, samplingRate, padding, mpegVersion, layerVersion) {
          var sampleLength = lib.sampleLengthMap[mpegVersion][layerVersion];
          var paddingSize = padding ? (layerVersion === "11" ? 4 : 1) : 0;
          var byteRate = kbitrate * 1000 / 8;
          return Math.floor((sampleLength * byteRate / samplingRate) + paddingSize);
      };

      lib.getXingOffset = function (mpegVersion, channelMode) {
          var mono = channelMode === "11";
          if (mpegVersion === "11") { // mpeg1
              return mono ? 21 : 36;
          } else {
              return mono ? 13 : 21;
          }
      };

      //
      lib.v1l1Bitrates = {
          "0000": "free",
          "0001": 32,
          "0010": 64,
          "0011": 96,
          "0100": 128,
          "0101": 160,
          "0110": 192,
          "0111": 224,
          "1000": 256,
          "1001": 288,
          "1010": 320,
          "1011": 352,
          "1100": 384,
          "1101": 416,
          "1110": 448,
          "1111": "bad"
      };

      //
      lib.v1l2Bitrates = {
          "0000": "free",
          "0001": 32,
          "0010": 48,
          "0011": 56,
          "0100": 64,
          "0101": 80,
          "0110": 96,
          "0111": 112,
          "1000": 128,
          "1001": 160,
          "1010": 192,
          "1011": 224,
          "1100": 256,
          "1101": 320,
          "1110": 384,
          "1111": "bad"
      };

      //
      lib.v1l3Bitrates = {
          "0000": "free",
          "0001": 32,
          "0010": 40,
          "0011": 48,
          "0100": 56,
          "0101": 64,
          "0110": 80,
          "0111": 96,
          "1000": 112,
          "1001": 128,
          "1010": 160,
          "1011": 192,
          "1100": 224,
          "1101": 256,
          "1110": 320,
          "1111": "bad"
      };

      //
      lib.v2l1Bitrates = {
          "0000": "free",
          "0001": 32,
          "0010": 48,
          "0011": 56,
          "0100": 64,
          "0101": 80,
          "0110": 96,
          "0111": 112,
          "1000": 128,
          "1001": 144,
          "1010": 160,
          "1011": 176,
          "1100": 192,
          "1101": 224,
          "1110": 256,
          "1111": "bad"
      };

      //
      lib.v2l2Bitrates = {
          "0000": "free",
          "0001": 8,
          "0010": 16,
          "0011": 24,
          "0100": 32,
          "0101": 40,
          "0110": 48,
          "0111": 56,
          "1000": 64,
          "1001": 80,
          "1010": 96,
          "1011": 112,
          "1100": 128,
          "1101": 144,
          "1110": 160,
          "1111": "bad"
      };
      lib.v2l3Bitrates = lib.v2l2Bitrates;

      //
      lib.v1SamplingRates = {
          "00": 44100,
          "01": 48000,
          "10": 32000,
          "11": "reserved"
      };

      //
      lib.v2SamplingRates = {
          "00": 22050,
          "01": 24000,
          "10": 16000,
          "11": "reserved"
      };

      //
      lib.v25SamplingRates = {
          "00": 11025,
          "01": 12000,
          "10": 8000,
          "11": "reserved"
      };

      //
      lib.channelModes = {
          "00": "Stereo",
          "01": "Joint stereo (Stereo)",
          "10": "Dual channel (Stereo)",
          "11": "Single channel (Mono)"
      };

      //
      lib.mpegVersionDescription = {
          "00": "MPEG Version 2.5 (unofficial)",
          "01": "reserved",
          "10": "MPEG Version 2 (ISO/IEC 13818-3)",
          "11": "MPEG Version 1 (ISO/IEC 11172-3)"
      };

      //
      lib.layerDescription = {
          "00": "reserved",
          "01": "Layer III",
          "10": "Layer II",
          "11": "Layer I"
      };

      //
      lib.bitrateMap = {
          "11": {
              "01": lib.v1l3Bitrates,
              "10": lib.v1l2Bitrates,
              "11": lib.v1l1Bitrates
          },
          "10": {
              "01": lib.v2l3Bitrates,
              "10": lib.v2l2Bitrates,
              "11": lib.v2l1Bitrates
          }
      };

      //
      lib.samplingRateMap = {
          "00": lib.v25SamplingRates,
          "10": lib.v2SamplingRates,
          "11": lib.v1SamplingRates
      };

      //
      lib.v1SampleLengths = {
          "01": 1152,
          "10": 1152,
          "11": 384
      };

      //
      lib.v2SampleLengths = {
          "01": 576,
          "10": 1152,
          "11": 384
      };

      //
      lib.sampleLengthMap = {
          "01": lib.v2SampleLengths,
          "10": lib.v2SampleLengths,
          "11": lib.v1SampleLengths
      };

      // Convert the given string `str` to an array of words (octet pairs). If all characters in the
      //  given string are within the ISO/IEC 8859-1 subset then the returned array may safely be
      //  interpreted as an array of values in the [0, 255] range, where each value requires a single
      //  octet to be represented. Otherwise it should be interpreted as an array of values in the
      //  [0, 65.535] range, where each value requires a word (octet pair) to be represented.
      //
      // Not meant to be used with UTF-16 strings that contain chars outside the BMP. See
      //  [charCodeAt on MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/charCodeAt)
      lib.wordSeqFromStr = function (str) {
          for (var i = str.length - 1, seq = []; i >= 0; --i) {
              seq[i] = str.charCodeAt(i);
          }
          return seq;
      };

      // Common character sequences converted to byte arrays
      lib.seq = {
          id3: lib.wordSeqFromStr("ID3"),
          xing: lib.wordSeqFromStr("Xing"),
          info: lib.wordSeqFromStr("Info")
      };

      // A handy no-op to reuse
      lib.noOp = function () {};

      // Decode a [synchsafe](http://en.wikipedia.org/wiki/Synchsafe) value. Synchsafes are used in
      //  ID3 tags, instead of regular ints, to avoid the unintended introduction of bogus
      //  frame-syncs. Note that the spec requires that syncsafe be always stored in big-endian order
      //  (Implementation shamefully lifted from relevant wikipedia article)
      lib.unsynchsafe = function (value) {
          var out = 0;
          var mask = 0x7F000000;

          while (mask) {
              out >>= 1;
              out |= value & mask;
              mask >>= 8;
          }

          return out;
      };

      // Get a value indicating whether given DataView `view` contains the `seq` sequence (array
      //  of octets) at `offset` index. Note that no check is performed for the adequate length of
      //  given view as this should be carried out by the caller
      lib.isSeq = function (seq, view, offset) {
          for (var i = seq.length - 1; i >= 0; i--) {
              if (seq[i] !== view.getUint8(offset + i)) { return false; }
          }
          return true;
      };

      // Get a value indicating whether given DataView `view` contains the `str` string
      //  at `offset` index. The view is parsed as an array of 8bit single-byte coded characters
      //  (i.e. ISO/IEC 8859-1, _non_ Unicode). Will return the string itself if it does, false
      //  otherwise. Note that no check is performed for the adequate length of given view as
      //  this should be carried out be the caller as part of the section-parsing process
      /*
      isStr = function (str, view, offset) {
          return isSeq(lib.wordSeqFromStr(str), view, offset) ? str : false;
      };
      */

      // Locate first occurrence of sequence `seq` (an array of octets) in DataView `view`.
      //  Search starts at given `offset` and ends after `length` octets. Will return the
      //  absolute offset of sequence if found, -1 otherwise
      lib.locateSeq = function (seq, view, offset, length) {
          for (var i = 0, l = length - seq.length + 1; i < l; ++i) {
              if (lib.isSeq(seq, view, offset + i)) { return offset + i; }
          }
          return -1;
      };

      lib.locateStrTrm = {
          // Locate the first occurrence of non-Unicode null-terminator (i.e. a single zeroed-out
          //  octet) in DataView `view`. Search starts at given `offset` and ends after `length`
          //  octets. Will return the absolute offset of sequence if found, -1 otherwise
          iso: function (view, offset, length) {
              return lib.locateSeq([0], view, offset, length);
          },

          // Locate the first occurrence of Unicode null-terminator (i.e. a sequence of two
          //  zeroed-out octets) in DataView `view`. Search starts at given `offset` and ends after
          //  `length` octets. Will return the absolute offset of sequence if found, -1 otherwise
          ucs: function (view, offset, length) {
              var trmOffset = lib.locateSeq([0, 0], view, offset, length);
              if (trmOffset === -1) { return -1; }
              if ((trmOffset - offset) % 2 !== 0) { ++trmOffset; }
              return trmOffset;
          }
      };

      lib.readStr = {
          // Parse DataView `view` begining at `offset` index and return a string built from
          //  `length` octets. The view is parsed as an array of 8bit single-byte coded characters
          //  (i.e. ISO/IEC 8859-1, _non_ Unicode). Will essentially return the string comprised of
          //  octets [offset, offset + length). Note that no check is performed for the adequate
          //  length of given view as this should be carried out be the caller as part of the
          //  section-parsing process
          iso: function (view, offset, length) {
              return String.fromCharCode.apply(null, new Uint8Array(view.buffer, offset, length));
          },

          // UCS-2 (ISO/IEC 10646-1:1993, UCS-2) version of `readStr`. UCS-2 is the fixed-width
          //  two-byte subset of Unicode that can only express values inside the Basic Multilingual
          //  Plane (BMP). Note that this method is generally unsuitable for parsing non-trivial
          //  UTF-16 strings which may contain surrogate pairs. [This is only marginally related
          //  though as, according to ID3v2, all Unicode strings should be UCS-2.] Further info:
          //
          //  * [How to convert ArrayBuffer to and from String](http://updates.html5rocks.com/2012/06/How-to-convert-ArrayBuffer-to-and-from-String)
          //  * [The encoding spec](http://encoding.spec.whatwg.org/)
          //  * [stringencoding shim](https://code.google.com/p/stringencoding/)
          //
          // About the BOM: The current implementation will check for and remove the leading BOM from
          //  the given view to avoid invisible characters that mess up the resulting strings. MDN's
          //  documentation for [fromCharCode](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/String/fromCharCode)
          //  suggests that it can correctly convert UCS-2 buffers to strings. And indeed, tests
          //  performed with UCS-2 LE encoded frames indicate that it does. However, no tests have
          //  been made for UCS-2 BE. (Kid3, the ID3v2 Tag generator used for tests at the time of
          //  this writing, goes totally weird when switched to BE)
          ucs: function (view, offset, length) {
              // Tweak offset to remove the BOM (LE: FF FE / BE: FE FF)
              if (view.getUint16(offset) === 0xFFFE || view.getUint16(offset) === 0xFEFF) {
                  offset += 2;
                  length -= 2;
              }

              var buffer = view.buffer;

              // When offset happens to be an even number of octets, the array-buffer may be wrapped
              //  in a Uint16Array. In the event that it's _not_, an actual copy has to be made
              // (Note that Node <= 0.8 as well as IE <= 10 lack an ArrayBuffer#slice. TODO: shim it)
              if (offset % 2 === 1) {
                  buffer = buffer.slice(offset, offset + length);
                  offset = 0;
              }

              return String.fromCharCode.apply(null, new Uint16Array(buffer, offset, length / 2));
          }
      };

      lib.readTrmStr = {
          // Similar to `readStr.iso` but will check for a null-terminator determining the end of the
          //  string. The returned string will be of _at most_ `length` octets
          iso: function (view, offset, length) {
              var trmOffset = lib.locateStrTrm.iso(view, offset, length);
              if (trmOffset !== -1) { length = trmOffset - offset; }
              return lib.readStr.iso(view, offset, length);
          },

          // Similar to `readStr.ucs` but will check for a null-terminator determining the end of the
          //  string. The returned string will be of _at most_ `length` octets
          ucs: function (view, offset, length) {
              var trmOffset = lib.locateStrTrm.ucs(view, offset, length);
              if (trmOffset !== -1) { length = trmOffset - offset; }
              return lib.readStr.ucs(view, offset, length);
          }
      };

      // ### Read a Frame Header
      //
      // Read header of frame located at `offset` of DataView `view`. Returns null in the event
      //  that no frame header is found at `offset`
      lib.readFrameHeader = function (view, offset) {
          offset || (offset = 0);

          // There should be more than 4 octets ahead
          if (view.byteLength - offset <= 4) { return null; }

          // Header's first (out of four) octet: `11111111`: Frame sync (all bits must be set)
          var b1 = view.getUint8(offset);
          if (b1 !== 255) { return null; }

          // Header's second (out of four) octet: `111xxxxx`
          //
          // * `111.....`: Rest of frame sync (all bits must be set)
          // * `...BB...`: MPEG Audio version ID (11 -> MPEG Version 1 (ISO/IEC 11172-3))
          // * `.....CC.`: Layer description (01 -> Layer III)
          // * `.......1`: Protection bit (1 = Not protected)

          // Require the three most significant bits to be `111` (>= 224)
          var b2 = view.getUint8(offset + 1);
          if (b2 < 224) { return null; }

          var mpegVersion = octetToBinRep(b2).substr(3, 2);
          var layerVersion = octetToBinRep(b2).substr(5, 2);

          //
          var header = {
              _section: { type: "frameHeader", byteLength: 4, offset: offset },
              mpegAudioVersionBits: mpegVersion,
              mpegAudioVersion: lib.mpegVersionDescription[mpegVersion],
              layerDescriptionBits: layerVersion,
              layerDescription: lib.layerDescription[layerVersion],
              isProtected: b2 & 1, // Just check if last bit is set
          };
          header.protectionBit = header.isProtected ? "1" : "0";

          if (header.mpegAudioVersion === "reserved") { return null; }
          if (header.layerDescription === "reserved") { return null; }

          // Header's third (out of four) octet: `EEEEFFGH`
          //
          // * `EEEE....`: Bitrate index. 1111 is invalid, everything else is accepted
          // * `....FF..`: Sampling rate, 00=44100, 01=48000, 10=32000, 11=reserved
          // * `......G.`: Padding bit, 0=frame not padded, 1=frame padded
          // * `.......H`: Private bit. This is informative
          var b3 = view.getUint8(offset + 2);
          b3 = octetToBinRep(b3);
          header.bitrateBits = b3.substr(0, 4);
          header.bitrate = lib.bitrateMap[mpegVersion][layerVersion][header.bitrateBits];
          if (header.bitrate === "bad") { return null; }

          header.samplingRateBits = b3.substr(4, 2);
          header.samplingRate = lib.samplingRateMap[mpegVersion][header.samplingRateBits];
          if (header.samplingRate === "reserved") { return null; }

          header.frameIsPaddedBit = b3.substr(6, 1);
          header.frameIsPadded = header.frameIsPaddedBit === "1";
          header.framePadding = header.frameIsPadded ? 1 : 0;

          header.privateBit = b3.substr(7, 1);

          // Header's fourth (out of four) octet: `IIJJKLMM`
          //
          // * `II......`: Channel mode
          // * `..JJ....`: Mode extension (only if joint stereo)
          // * `....K...`: Copyright
          // * `.....L..`: Original
          // * `......MM`: Emphasis
          var b4 = view.getUint8(offset + 3);
          header.channelModeBits = octetToBinRep(b4).substr(0, 2);
          header.channelMode = lib.channelModes[header.channelModeBits];

          return header;
      };

      // ### Read a Frame
      //
      // Read frame located at `offset` of DataView `view`. Will acquire the frame header (see
      //  `readFrameHeader`) plus some basic information about the frame - notably the frame's length
      //  in bytes. If `requireNextFrame` is set, the presence of a _next_ valid frame will be
      //  required for _this_ frame to be regarded as valid. Returns null in the event that no frame
      //  is found at `offset`
      lib.readFrame = function (view, offset, requireNextFrame) {
          offset || (offset = 0);

          var frame = {
              _section: { type: "frame", offset: offset },
              header: lib.readFrameHeader(view, offset)
          };

          var head = frame.header; // Convenience shortcut

          // Frame should always begin with a valid header
          if (!head) { return null; }

          frame._section.sampleLength =
              lib.sampleLengthMap[head.mpegAudioVersionBits][head.layerDescriptionBits];

          //
          frame._section.byteLength = lib.getFrameByteLength(head.bitrate, head.samplingRate,
              head.framePadding, head.mpegAudioVersionBits, head.layerDescriptionBits);
          frame._section.nextFrameIndex = offset + frame._section.byteLength;

          // No "Xing" or "Info" identifier should be present - this would indicate that this
          //  is in fact a Xing tag masquerading as a frame
          var xingOffset = lib.getXingOffset(head.mpegAudioVersionBits, head.channelModeBits);
          if (lib.isSeq(lib.seq.xing, view, offset + xingOffset) ||
              lib.isSeq(lib.seq.info, view, offset + xingOffset)) {
              return null;
          }

          // If a next frame is required then the data at `frame._section.nextFrameIndex` should be
          //  a valid frame header
          if (requireNextFrame && !lib.readFrameHeader(view, frame._section.nextFrameIndex)) {
              return null;
          }

          return frame;
      };
  }));
  });

  var id3v2 = createCommonjsModule(function (module, exports) {
  //     mp3-parser/id3v2 v0.3.0

  //     https://github.com/biril/mp3-parser
  //     Licensed and freely distributed under the MIT License
  //     Copyright (c) 2013-2016 Alex Lambiris

  // ----

  /* jshint browser:true */
  /* global exports:false, define:false, require:false */
  (function (globalObject, createModule) {

      // Global `exports` object signifies CommonJS enviroments with `module.exports`, e.g. Node
      {
          return createModule(exports, lib);
      }
  }(commonjsGlobal, function (mp3Id3v2Parser, lib) {

      //
      var id3v2TagFrameNames = {
          AENC: "Audio encryption",
          APIC: "Attached picture",
          CHAP: "Chapter",
          COMM: "Comments",
          COMR: "Commercial frame",
          ENCR: "Encryption method registration",
          EQUA: "Equalization",
          ETCO: "Event timing codes",
          GEOB: "General encapsulated object",
          GRID: "Group identification registration",
          IPLS: "Involved people list",
          LINK: "Linked information",
          MCDI: "Music CD identifier",
          MLLT: "MPEG location lookup table",
          OWNE: "Ownership frame",
          PRIV: "Private frame",
          PCNT: "Play counter",
          POPM: "Popularimeter",
          POSS: "Position synchronisation frame",
          RBUF: "Recommended buffer size",
          RVAD: "Relative volume adjustment",
          RVRB: "Reverb",
          SYLT: "Synchronized lyric/text",
          SYTC: "Synchronized tempo codes",
          TALB: "Album/Movie/Show title",
          TBPM: "BPM (beats per minute)",
          TCOM: "Composer",
          TCON: "Content type",
          TCOP: "Copyright message",
          TDAT: "Date",
          TDLY: "Playlist delay",
          TENC: "Encoded by",
          TEXT: "Lyricist/Text writer",
          TFLT: "File type",
          TIME: "Time",
          TIT1: "Content group description",
          TIT2: "Title/songname/content description",
          TIT3: "Subtitle/Description refinement",
          TKEY: "Initial key",
          TLAN: "Language(s)",
          TLEN: "Length",
          TMED: "Media type",
          TOAL: "Original album/movie/show title",
          TOFN: "Original filename",
          TOLY: "Original lyricist(s)/text writer(s)",
          TOPE: "Original artist(s)/performer(s)",
          TORY: "Original release year",
          TOWN: "File owner/licensee",
          TPE1: "Lead performer(s)/Soloist(s)",
          TPE2: "Band/orchestra/accompaniment",
          TPE3: "Conductor/performer refinement",
          TPE4: "Interpreted, remixed, or otherwise modified by",
          TPOS: "Part of a set",
          TPUB: "Publisher",
          TRCK: "Track number/Position in set",
          TRDA: "Recording dates",
          TRSN: "Internet radio station name",
          TRSO: "Internet radio station owner",
          TSIZ: "Size",
          TSRC: "ISRC (international standard recording code)",
          TSSE: "Software/Hardware and settings used for encoding",
          TYER: "Year",
          TXXX: "User defined text information frame",
          UFID: "Unique file identifier",
          USER: "Terms of use",
          USLT: "Unsychronized lyric/text transcription",
          WCOM: "Commercial information",
          WCOP: "Copyright/Legal information",
          WOAF: "Official audio file webpage",
          WOAR: "Official artist/performer webpage",
          WOAS: "Official audio source webpage",
          WORS: "Official internet radio station homepage",
          WPAY: "Payment",
          WPUB: "Publishers official webpage",
          WXXX: "User defined URL link frame"
      };

      //
      var readFrameContent = {};

      // Read the content of a
      //  [text-information frame](http://id3.org/id3v2.3.0#Text_information_frames). These are
      //  common and contain info such as artist and album. There may only be one text info frame
      //  of its kind in a tag. If the textstring is followed by a termination (00) all the
      //  following information should be ignored and not be displayed. All text frame
      //  identifiers begin with "T". Only text frame identifiers begin with "T", with the
      //  exception of the "TXXX" frame
      //
      // * Encoding:    a single octet where 0 = ISO-8859-1, 1 = UCS-2
      // * Information: a text string according to encoding
      readFrameContent.T = function (view, offset, length) {
          var content = { encoding: view.getUint8(offset) };
          content.value = lib.readStr[content.encoding === 0 ? "iso" : "ucs"](
              view, offset + 1, length - 1);
          return content;
      };

      // Read the content of a
      //  [user-defined text-information frame](http://id3.org/id3v2.3.0#User_defined_text_information_frame).
      //  Intended for one-string text information concerning the audiofile in a similar way to
      //  the other "T"-frames. The frame body consists of a description of the string,
      //  represented as a terminated string, followed by the actual string. There may be more
      //  than one "TXXX" frame in each tag, but only one with the same description
      //
      // * Encoding:    a single octet where 0 = ISO-8859-1, 1 = UCS-2
      // * Description: a text string according to encoding (followed by 00 (00))
      // * Value:       a text string according to encoding
      readFrameContent.TXXX = function  (view, offset, length) {
          // The content to be returned
          var content = { encoding: view.getUint8(offset) };

          // Encoding + null term. = at least 2 octets
          if (length < 2) {
              return content; // Inadequate length!
          }

          // Encoding and content beginning (description field)
          var enc = content.encoding === 0 ? "iso" : "ucs";
          var offsetBeg = offset + 1;

          // Locate the the null terminator seperating description and URL
          var offsetTrm = lib.locateStrTrm[enc](view, offsetBeg, length - 4);
          if (offsetTrm === -1) {
              return content; // Not found!
          }

          // Read description and value data into content
          content.description = lib.readStr[enc](view, offsetBeg, offsetTrm - offsetBeg);
          offsetTrm += enc === "ucs" ? 2 : 1; // Move past terminating sequence
          content.value = lib.readStr[enc](view, offsetTrm, offset + length - offsetTrm);

          return content;
      };

      // Read the content of a
      //  [URL-link frame](http://id3.org/id3v2.3.0#URL_link_frames). There may only be one
      //  URL link frame of its kind in a tag, except when stated otherwise in the frame
      //  description. If the textstring is followed by a termination (00) all the following
      //  information should be ignored and not be displayed. All URL link frame identifiers
      //  begins with "W". Only URL link frame identifiers begins with "W"
      //
      // * URL: a text string
      readFrameContent.W = function (view, offset, length) {
          return { value: lib.readStr.iso(view, offset, length) };
      };

      // Read the content of a
      //  [user-defined URL-link frame](http://id3.org/id3v2.3.0#User_defined_URL_link_frame).
      //  Intended for URL links concerning the audiofile in a similar way to the other
      //  "W"-frames. The frame body consists of a description of the string, represented as a
      //  terminated string, followed by the actual URL. The URL is always encoded with
      //  ISO-8859-1. There may be more than one "WXXX" frame in each tag, but only one with the
      //  same description
      //
      // * Encoding:    a single octet where 0 = ISO-8859-1, 1 = UCS-2
      // * Description: a text string according to encoding (followed by 00 (00))
      // * URL:         a text string
      readFrameContent.WXXX = function (view, offset, length) {
          // The content to be returned
          var content = { encoding: view.getUint8(offset) };

          // Encoding + null term. = at least 2 octets
          if (length < 2) {
              return content; // Inadequate length!
          }

          // Encoding and content beginning (description field)
          var enc = content.encoding === 0 ? "iso" : "ucs";
          var offsetBeg = offset + 1;

          // Locate the the null terminator seperating description and URL
          var offsetTrm = lib.locateStrTrm[enc](view, offsetBeg, length - 4);
          if (offsetTrm === -1) {
              return content; // Not found!
          }

          // Read description and value data into content
          content.description = lib.readStr[enc](view, offsetBeg, offsetTrm - offsetBeg);
          offsetTrm += enc === "ucs" ? 2 : 1; // Move past terminating sequence
          content.value = lib.readStr.iso(view, offsetTrm, offset + length - offsetTrm);

          return content;
      };

      // Read the content of a [comment frame](http://id3.org/id3v2.3.0#Comments).
      //  Intended for any kind of full text information that does not fit in any other frame.
      //  Consists of a frame header followed by encoding, language and content descriptors and
      //  ends with the actual comment as a text string. Newline characters are allowed in the
      //  comment text string. There may be more than one comment frame in each tag, but only one
      //  with the same language and content descriptor. [Note that the structure of comment
      //  frames is identical to that of USLT frames - `readFrameContentComm` will handle both.]
      //
      // * Encoding:    a single octet where 0 = ISO-8859-1, 1 = UCS-2
      // * Language:    3 digit (octet) lang-code (ISO-639-2)
      // * Short descr: a text string according to encoding (followed by 00 (00))
      // * Actual text: a text string according to encoding
      readFrameContent.COMM = function (view, offset, length) {
          // The content to be returned
          var content = { encoding: view.getUint8(offset) };

          // Encoding + language + null term. = at least 5 octets
          if (length < 5) {
              return content; // Inadequate length!
          }

          // Encoding and content beggining (short description field)
          var enc = content.encoding === 0 ? "iso" : "ucs";
          var offsetBeg = offset + 4;

          // Read the language field - 3 octets at most
          content.language = lib.readTrmStr.iso(view, offset + 1, 3);

          // Locate the the null terminator seperating description and text
          var offsetTrm = lib.locateStrTrm[enc](view, offsetBeg, length - 4);
          if (offsetTrm === -1) {
              return content; // Not found!
          }

          // Read short description and text data into content
          content.description = lib.readStr[enc](view, offsetBeg, offsetTrm - offsetBeg);
          offsetTrm += enc === "ucs" ? 2 : 1; // Move past terminating sequence
          content.text = lib.readStr[enc](view, offsetTrm, offset + length - offsetTrm);

          return content;
      };

      // Read the content of a
      //  [unique file identifier frame](http://id3.org/id3v2.3.0#Unique_file_identifier). Allows
      //  identification of the audio file by means of some database that may contain more
      //  information relevant to the content. Begins with a URL containing an email address, or
      //  a link to a location where an email address can be found that belongs to the
      //  organisation responsible for this specific database implementation. The 'Owner
      //  identifier' must be non-empty (more than just a termination) and is followed by the
      //  actual identifier, which may be up to 64 bytes. There may be more than one "UFID" frame
      //  in a tag, but only one with the same 'Owner identifier'. Note that this frame is very
      //  similar to the "PRIV" frame
      //
      // * Owner identifier: a text string (followed by 00)
      // * Identifier:       up to 64 bytes of binary data
      readFrameContent.UFID = function (view, offset, length) {
          // Read up to the first null terminator to get the owner-identifier
          var ownerIdentifier = lib.readTrmStr.iso(view, offset, length);

          // Figure out the identifier based on frame length vs owner-identifier length
          var identifier = new DataView(view.buffer, offset + ownerIdentifier.length + 1,
              length - ownerIdentifier.length - 1);

          return { ownerIdentifier: ownerIdentifier, identifier: identifier };
      };

      // Read the content of an
      //  [involved people list frame](http://id3.org/id3v2.3.0#Involved_people_list). Contains
      //  names of those involved - those contributing to the audio file - and how they were
      //  involved. The body simply contains the first 'involvement' as a terminated string, directly
      //  followed by the first 'involvee' as a terminated string, followed by a second terminated
      //  involvement string and so on. However, in the current implementation the frame's content is
      //  parsed as a collection of strings without any semantics attached. There may only be one
      //  "IPLS" frame in each tag
      //
      // * Encoding:            a single octet where 0 = ISO-8859-1, 1 = UCS-2
      // * People list strings: a series of strings, e.g. string 00 (00) string 00 (00) ..
      readFrameContent.IPLS = function (view, offset, length) {
          // The content to be returned
          var content = { encoding: view.getUint8(offset), values: [] };

          // Encoding and content beginning (people list - specifically, first 'involvement' string)
          var enc = content.encoding === 0 ? "iso" : "ucs";
          var offsetBeg = offset + 1;

          // Index of null-terminator found within people list (seperates involvement / involvee)
          var offsetNextStrTrm;

          while (offsetBeg < offset + length) {
              // We expect all strings within the people list to be null terminated ..
              offsetNextStrTrm = lib.locateStrTrm[enc](view, offsetBeg, length - (offsetBeg - offset));

              // .. except _perhaps_ the last one. In this case fix the offset at the frame's end
              if (offsetNextStrTrm === -1) {
                  offsetNextStrTrm = offset + length;
              }

              content.values.push(lib.readStr[enc](view, offsetBeg, offsetNextStrTrm - offsetBeg));
              offsetBeg = offsetNextStrTrm + (enc === "ucs" ? 2 : 1);
          }

          return content;
      };

      // Read the content of a [terms of use frame](http://id3.org/id3v2.3.0#Terms_of_use_frame).
      //  Contains a description of the terms of use and ownership of the file. Newlines are
      //  allowed in the text. There may only be one "USER" frame in a tag.
      //
      // * Encoding:    a single octet where 0 = ISO-8859-1, 1 = UCS-2
      // * Language:    3 digit (octet) lang-code (ISO-639-2)
      // * Actual text: a text string according to encoding
      readFrameContent.USER = function (view, offset, length) {
          // The content to be returned
          var content = { encoding: view.getUint8(offset) };

          // Encoding + language + null term. = at least 5 octets
          if (length < 5) {
              return content; // Inadequate length!
          }

          // Read the language field - 3 octets at most
          content.language = lib.readTrmStr.iso(view, offset + 1, 3);

          // Read the text field
          var offsetBeg = offset + 4;
          var enc = content.encoding === 0 ? "iso" : "ucs";
          content.text = lib.readStr[enc](view, offsetBeg, offset + length - offsetBeg);

          return content;
      };

      // Read the content of a
      //  [private frame](http://id3.org/id3v2.3.0#Private_frame). Contains binary data that does
      //  no fit into the other frames. Begins with a URL containing an email address, or
      //  a link to a location where an email address can be found. The 'Owner identifier' must
      //  be non-empty (more than just a termination) and is followed by the actual data. There
      //  may be more than one "PRIV" frame in a tag, but only with different contents. Note that
      //  this frame is very similar to the "UFID" frame
      //
      // * Owner identifier: a text string (followed by 00)
      // * private data:     binary data (of unbounded length)
      readFrameContent.PRIV = function (view, offset, length) {
          // Read up to the first null terminator to get the owner-identifier
          var ownerIdentifier = lib.readTrmStr.iso(view, offset, length);

          // Figure out the private data based on frame length vs owner-identifier length
          var privateData = new DataView(view.buffer, offset + ownerIdentifier.length + 1,
              length - ownerIdentifier.length - 1);

          return { ownerIdentifier: ownerIdentifier, privateData: privateData };
      };

      // Read the content of a [play counter](http://id3.org/id3v2.3.0#Play_counter). A counter
      //  of the number of times a file has been played. There may only be one "PCNT" frame in a
      //  tag. [According to the standard, "When the counter reaches all one's, one byte is
      //  inserted in front of the counter thus making the counter eight bits bigger." This is
      //  not currently taken into account]
      //
      // * Counter: 4 octets (at least ..)
      readFrameContent.PCNT = function (view, offset, length) {
          // The counter must be at least 4 octets long to begin with
          if (length < 4) {
              return {}; // Inadequate length!
          }

          // Assume the counter is always exactly 4 octets ..
          return { counter: view.getUint32(offset) };
      };

      // Read the content of a [popularimeter](http://id3.org/id3v2.3.0#Popularimeter). Intended
      //  as a measure for the file's popularity, it contains a user's email address, one rating
      //  octet and a four octer play counter, intended to be increased with one for every time
      //  the file is played. If no personal counter is wanted it may be omitted. [As is the case
      //  for the "PCNT" frame, according to the standard, "When the counter reaches all one's,
      //  one byte is inserted in front of the counter thus making the counter eight bits
      //  bigger." This is not currently taken into account]. There may be more than one "POPM"
      //  frame in each tag, but only one with the same email address
      //
      // * Email to user: a text string (followed by 00)
      // * Rating:        a single octet, values in 0-255 (0 = unknown, 1 = worst, 255 = best)
      // * Counter:       4 octets (at least ..)
      readFrameContent.POPM = function (view, offset, length) {
          var content = {
                  email: lib.readTrmStr.iso(view, offset, length)
              };

          // rating offset
          offset += content.email.length + 1;

          // email str term + rating + counter = at least 6 octets
          if (length < 6) {
              return content; // Inadequate length!
          }

          content.rating = view.getUint8(offset);

          // Assume the counter is always exactly 4 octets ..
          content.counter = view.getUint32(offset + 1);

          return content;
      };

      // Read the content of an [attached picture](http://id3.org/id3v2.3.0#Attached_picture).
      //  Contains a picture directly related to the audio file. In the event that the MIME media
      //  type name is omitted, "image/" will be implied. The description has a maximum length of
      //  64 characters, but may be empty. There may be several pictures attached to one file,
      //  each in their individual "APIC" frame, but only one with the same content descriptor.
      //  There may only be one picture with the picture type declared as picture type $01 and
      //  $02 respectively.
      //
      // * Encoding:     a single octet where 0 = ISO-8859-1, 1 = UCS-2
      // * MIME Type:    a text string (followed by 00) - MIME type and subtype of image
      // * Picture type: a single octet, values in 0-255: a type-id as given by the standard
      // * Description:  a text string according to encoding (followed by 00 (00))
      // * Picture data: binary data (of unbounded length)
      readFrameContent.APIC = function (view, offset, length) {
          // The content to be returned
          var content = { encoding: view.getUint8(offset) };

          // Encoding + MIME type string term + pic type octet + descr. string term = min 4 octets
          if (length < 4) {
              return content; // Inadequate length!
          }

          // Encoding and offsets of content beginning / null-terminator
          var enc = content.encoding === 0 ? "iso" : "ucs";
          var offsetBeg, offsetTrm;

          // Locate the the null terminator seperating MIME type and picture type
          offsetBeg = offset + 1; // After the encoding octet
          offsetTrm = lib.locateStrTrm.iso(view, offsetBeg, length - 1);
          if (offsetTrm === -1) {
              return content; // Not found!
          }

          // Read MIME type
          content.mimeType = lib.readStr.iso(view, offsetBeg, offsetTrm - offsetBeg);

          // Read picture type
          offsetBeg = offsetTrm + 1;
          content.pictureType = view.getUint8(offsetBeg);

          // Locate the the null terminator seperating description and picture data
          offsetBeg += 1;
          offsetTrm = lib.locateStrTrm[enc](view, offsetBeg, offset + length - offsetBeg);
          if (offsetTrm === -1) {
              return content; // Not found!
          }

          // Read description
          content.description = lib.readStr[enc](view, offsetBeg, offsetTrm - offsetBeg);

          // Read picture data
          offsetBeg = offsetTrm + (enc === "ucs" ? 2 : 1);
          content.pictureData = new DataView(view.buffer, offsetBeg, offset + length - offsetBeg);

          return content;
      };

      // Read the chapter tag according to the ID3v2 Chapter Frame Addendum (http://id3.org/id3v2-chapters-1.0)
      //  The frame contains subframes, typically TIT2, and possibly additional frames
      //
      // * Id:            string identifier of the chapter
      // * Start time:    4 octets specifying the start of the chapter in milliseconds
      // * End time:      4 octets specifying the end of the chapter in milliseconds
      // * Start offset:  4 octets specifying the start of the chapter in bytes
      // * End offset:    4 octets specifying the end of the chapter in bytes
      // * Frames:        nested id3v2 frames
      readFrameContent.CHAP = function (view, offset, length) {
          // The content to be returned
          var content = { encoding: view.getUint8(offset) };

          // Locate the the null terminator between id and start time
          var offsetTrm = lib.locateStrTrm.iso(view, offset, length - 1);

          if (offsetTrm === -1) {
              return content; // Not found!
          }

          // Read id
          content.id = lib.readStr.iso(view, offset, offsetTrm - offset);

          // Read start time
          content.startTime = view.getUint32(offsetTrm + 1);

          // Read end time
          content.endTime = view.getUint32(offsetTrm + 5);

          // Read start offset
          content.startOffset = view.getUint32(offsetTrm + 9);

          // Read end offset
          content.endOffset = view.getUint32(offsetTrm + 13);

          var offsetSubFrames = offsetTrm + 17;
          content.frames = [];
          while (offsetSubFrames < offset + length) {
              var subFrame = mp3Id3v2Parser.readId3v2TagFrame(view, offsetSubFrames);
              content.frames.push(subFrame);
              offsetSubFrames += subFrame.header.size + 10;
          }

          return content;
      };

      // ### Read an ID3v2 Tag Frame
      //
      // Read [ID3v2 Tag frame](http://id3.org/id3v2.3.0#Declared_ID3v2_frames) located at `offset`
      //  of DataView `view`. Returns null in the event that no tag-frame is found at `offset`
      mp3Id3v2Parser.readId3v2TagFrame = function (view, offset) {
          // All frames consist of a frame header followed by one or more fields containing the actual
          // information. The frame header is 10 octets long and laid out as `IIIISSSSFF`, where
          //
          // * `IIII......`: Frame id (four characters)
          // * `....SSSS..`: Size (frame size excluding frame header = frame size - 10)
          // * `........FF`: Flags
          var frame = {
              header: {
                  id: lib.readStr.iso(view, offset, 4),
                  size: view.getUint32(offset + 4),
                  flagsOctet1: view.getUint8(offset + 8),
                  flagsOctet2: view.getUint8(offset + 9)
              }
          };

          // An ID3v2 tag frame must have a length of at least 1 octet, excluding the header
          if (frame.header.size < 1) { return frame; }

          // A function to read the frame's content
          var readContent = (function (read, id) { // jscs:disable requirePaddingNewLinesBeforeLineComments
              // User-defined text-information frames
              if (id === "TXXX") { return read.TXXX; }
              // Text-information frames
              if (id.charAt(0) === "T") { return read.T; }
              // User-defined URL-link frames
              if (id === "WXXX") { return read.WXXX; }
              // URL-link frames
              if (id.charAt(0) === "W") { return read.W; }
              // Comment frames or Unsychronised lyrics/text transcription frames
              if (id === "COMM" || id === "USLT") { return read.COMM; }
              // For any other frame such as UFID, IPLS, USER, etc, return the reader function
              //  that's named after the frame. Return a 'no-op reader' (which just returns
              //  `undefined` as the frame's content) if no implementation found for given frame
              return read[id] || lib.noOp;
          }(readFrameContent, frame.header.id)); // jscs-enable requirePaddingNewLinesBeforeLineComments

          // Store frame's friendly name
          frame.name = id3v2TagFrameNames[frame.header.id];

          // Read frame's content
          frame.content = readContent(view, offset + 10, frame.header.size);

          return frame;
      };

      // ### Read the ID3v2 Tag
      //
      // Read [ID3v2 Tag](http://id3.org/id3v2.3.0) located at `offset` of DataView `view`. Returns
      //  null in the event that no tag is found at `offset`
      mp3Id3v2Parser.readId3v2Tag = function (view, offset) {
          offset || (offset = 0);

          // The ID3v2 tag header, which should be the first information in the file, is 10 octets
          //  long and laid out as `IIIVVFSSSS`, where
          //
          // * `III.......`: id, always "ID3" (0x49/73, 0x44/68, 0x33/51)
          // * `...VV.....`: version (major version + revision number)
          // * `.....F....`: flags: abc00000. a:unsynchronisation, b:extended header, c:experimental
          // * `......SSSS`: tag's size as a synchsafe integer

          // There should be at least 10 bytes ahead
          if (view.byteLength - offset < 10) { return null; }

          // The 'ID3' identifier is expected at given offset
          if (!lib.isSeq(lib.seq.id3, view, offset)) { return null; }

          //
          var flagsOctet = view.getUint8(offset + 5);

          //
          var tag = {
              _section: { type: "ID3v2", offset: offset },
              header: {
                  majorVersion: view.getUint8(offset + 3),
                  minorRevision: view.getUint8(offset + 4),
                  flagsOctet: flagsOctet,
                  unsynchronisationFlag: (flagsOctet & 128) === 128,
                  extendedHeaderFlag: (flagsOctet & 64) === 64,
                  experimentalIndicatorFlag: (flagsOctet & 32) === 32,
                  size: lib.unsynchsafe(view.getUint32(offset + 6))
              },
              frames: []
          };

          // The size as expressed in the header is the size of the complete tag after
          //  unsychronisation, including padding, excluding the header but not excluding the
          //  extended header (total tag size - 10)
          tag._section.byteLength = tag.header.size + 10;

          // Index of octet following tag's last octet: The tag spans [offset, tagEnd)
          //  (including the first 10 header octets)
          var tagEnd = offset + tag._section.byteLength;

          // TODO: Process extended header if present. The presence of an extended header will affect
          //  the offset. Currently, it is asummed that no extended header is present so the offset
          //  is fixed at 10 octets
          // if (tag.header.extendedHeaderFlag) { /* TODO */ }

          // Go on to read individual frames but only if the tag version is v2.3. This is the only
          //  version currently supported
          if (tag.header.majorVersion !== 3) { return tag; }

          // To store frames as they're discovered while paring the tag
          var frame;

          // Move offset past the end of the tag header to start reading tag frames
          offset += 10;
          while (offset < tagEnd) {
              // Locating a frame with a zeroed out id indicates that all valid frames have already
              //  been parsed. It's all dead space hereon so practically we're done
              if (view.getUint32(offset) === 0) { break; }

              frame = mp3Id3v2Parser.readId3v2TagFrame(view, offset);

              // Couldn't parse this frame so bail out
              if (!frame) { break; }

              tag.frames.push(frame);
              offset += frame.header.size + 10;
          }

          return tag;
      };
  }));
  });

  var xing = createCommonjsModule(function (module, exports) {
  //     mp3-parser/xing v0.3.0

  //     https://github.com/biril/mp3-parser
  //     Licensed and freely distributed under the MIT License
  //     Copyright (c) 2013-2016 Alex Lambiris

  // ----

  /* jshint browser:true */
  /* global exports:false, define:false, require:false */
  (function (globalObject, createModule) {

      // Global `exports` object signifies CommonJS enviroments with `module.exports`, e.g. Node
      {
          return createModule(exports, lib);
      }
  }(commonjsGlobal, function (xingParser, lib) {

      // ### Read the Xing Tag
      //
      // Read [Xing / Lame Tag](http://gabriel.mp3-tech.org/mp3infotag.html) located at `offset` of
      //  DataView `view`. Returns null in the event that no frame is found at `offset`
      xingParser.readXingTag = function (view, offset) {
          offset || (offset = 0);

          var tag = {
              _section: { type: "Xing", offset: offset },
              header: lib.readFrameHeader(view, offset)
          };

          var head = tag.header; // Convenience shortcut

          // The Xing tag should begin with a valid frame header
          if (!head) { return null; }

          var xingOffset = offset +
              lib.getXingOffset(head.mpegAudioVersionBits, head.channelModeBits);

          // There should be at least 'offset' (header) + 4 ("Xing"/"Info") octets ahead
          if (view.byteLength < xingOffset + 4) { return null; }

          // A "Xing" or "Info" identifier should be present
          tag.identifier = (lib.isSeq(lib.seq.xing, view, xingOffset) && "Xing") ||
              (lib.isSeq(lib.seq.info, view, xingOffset) && "Info");
          if (!tag.identifier) { return null; }

          //
          tag._section.byteLength = lib.getFrameByteLength(head.bitrate, head.samplingRate,
              head.framePadding, head.mpegAudioVersionBits, head.layerDescriptionBits);
          tag._section.nextFrameIndex = offset + tag._section.byteLength;

          return tag;
      };
  }));
  });

  var main = createCommonjsModule(function (module, exports) {
  //     mp3-parser v0.3.0

  //     https://github.com/biril/mp3-parser
  //     Licensed and freely distributed under the MIT License
  //     Copyright (c) 2013-2016 Alex Lambiris

  // ----

  /* jshint browser:true */
  /* global exports:false, define:false, require:false */
  (function (globalObject, createModule) {

      // Global `exports` object signifies CommonJS enviroments with `module.exports`, e.g. Node
      {
          return createModule(exports, lib, id3v2,
              xing);
      }
  }(commonjsGlobal, function (mp3Parser, lib, id3v2Parser, xingParser) {

      // ### TL;DR
      //
      // The parser exposes a collection of `read____` methods, each dedicated to reading a specific
      //  section of the mp3 file. The current implementation includes `readFrameHeader`, `readFrame`,
      //  `readId3v2Tag` and `readXingTag`. Each of these accepts a DataView-wrapped ArrayBuffer,
      //  which should contain the actual mp3 data, and optionally an offset into the buffer.
      //
      // All methods return a description of the section read in the form of a hash containing
      //  key-value pairs relevant to the section. For example the hash returned from
      //  `readFrameHeader` always contains an `mpegAudioVersion` key of value "MPEG Version 1
      //  (ISO/IEC 11172-3)" and a `layerDescription` key of value "Layer III". A description will
      //  always have a `_section` hash with `type`, `byteLength` and `offset` keys:
      //
      //  * `type`: "frame", "frameHeader", "Xing" or "ID3"
      //  * `byteLenfth`: Size of the section in bytes
      //  * `offset`: Buffer offset at which this section resides

      // ----

      // ### Read a Frame Header
      //
      // Read and return description of header of frame located at `offset` of DataView `view`.
      //  Returns `null` in the event that no frame header is found at `offset`
      mp3Parser.readFrameHeader = function (view, offset) {
          return lib.readFrameHeader(view, offset);
      };

      // ### Read a Frame
      //
      // Read and return description of frame located at `offset` of DataView `view`. Includes the
      //  frame header description (see `readFrameHeader`) plus some basic information about the
      //  frame - notably the frame's length in bytes. If `requireNextFrame` is set, the presence of
      //  a _next_ valid frame will be required for _this_ frame to be regarded as valid. Returns
      //  null in the event that no frame is found at `offset`
      mp3Parser.readFrame = function (view, offset, requireNextFrame) {
          return lib.readFrame(view, offset, requireNextFrame);
      };

      // ### Read the Last Frame
      //
      // Locate and return description of the very last valid frame in given DataView `view`. The
      //  search is carried out in reverse, from given `offset` (or the very last octet if `offset`
      //  is ommitted) to the first octet in the view. If `requireNextFrame` is set, the presence
      //  of a next valid frame will be required for any found frame to be regarded as valid (causing
      //  the method to essentially return the next-to-last frame on success). Returns `null` in the
      //  event that no frame is found at `offset`
      mp3Parser.readLastFrame = function (view, offset, requireNextFrame) {
          offset || (offset = view.byteLength - 1);

          var lastFrame = null;

          for (; offset >= 0; --offset) {
              if (view.getUint8(offset) === 255) {
                  // Located a candidate frame as 255 is a possible frame-sync byte
                  lastFrame = mp3Parser.readFrame(view, offset, requireNextFrame);
                  if (lastFrame) { return lastFrame; }
              }
          }

          return null;
      };

      // ### Read the ID3v2 Tag
      //
      // Read and return description of [ID3v2 Tag](http://id3.org/id3v2.3.0) located at `offset` of
      //  DataView `view`. (This will include any and all
      //  [currently supported ID3v2 frames](https://github.com/biril/mp3-parser/wiki) located within
      //  the tag). Returns `null` in the event that no tag is found at `offset`
      mp3Parser.readId3v2Tag = function (view, offset) {
          return id3v2Parser.readId3v2Tag(view, offset);
      };

      // ### Read the Xing Tag
      //
      // Read and return description of
      //  [Xing / Lame Tag](http://gabriel.mp3-tech.org/mp3infotag.html) located at `offset` of
      //  DataView `view`. Returns `null` in the event that no frame is found at `offset`
      mp3Parser.readXingTag = function (view, offset) {
          return xingParser.readXingTag(view, offset);
      };

      // ### Read all Tags up to First Frame
      // Read and return descriptions of all tags found up to (and including) the very first frame.
      //  Returns an array of sections which may include a description of a located ID3V2 tag, a
      //  description of located Xing / Lame tag and a description of the a located first frame
      //  ( See [this](http://www.rengels.de/computer/mp3tags.html) and
      //  [this](http://stackoverflow.com/a/5013505) )
      mp3Parser.readTags = function (view, offset) {
          offset || (offset = 0);

          var sections = [];
          var section = null;
          var isFirstFrameFound = false;
          var bufferLength = view.byteLength;

          var readers = [mp3Parser.readId3v2Tag, mp3Parser.readXingTag, mp3Parser.readFrame];
          var numOfReaders = readers.length;

          // While we haven't located the first frame, pick the next offset ..
          for (; offset < bufferLength && !isFirstFrameFound; ++offset) {
              // .. and try out each of the 'readers' on it
              for (var i = 0; i < numOfReaders; ++i) {
                  section = readers[i](view, offset);

                  // If one of the readers successfully parses a section ..
                  if (section) {
                      // .. store it ..
                      sections.push(section);

                      // .. and push the offset to the very end of end of that section. This way,
                      //  we avoid iterating over offsets which definately aren't the begining of
                      //  some section (they're part of the located section)
                      offset += section._section.byteLength;

                      // If the section we just parsed is a frame then we've actually located the
                      //  first frame. Break out of the readers-loop making sure to set
                      //  isFirstFrameFound (so that we also exit the outer loop)
                      if (section._section.type === "frame") {
                          isFirstFrameFound = true;
                          break;
                      }

                      // The section is _not_ the first frame. So, having pushed the offset
                      //  appropriately, retry all readers
                      i = -1;
                  }
              }
          }

          return sections;
      };
  }));
  });

  const CHUNK_MAX_SIZE = 1000 * 1000;
  const DEFAULT_CONCURRENCY = 4;
  const CONCURRENCY =
    ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 1) > 2
      ? navigator.hardwareConcurrency
      : DEFAULT_CONCURRENCY;

  /**
   * Creates a new ArrayBuffer out of two Uint8Arrays
   *
   * @private
   * @param   {Uint8Array}  baseUint8Array  first Uint8Array.
   * @param   {Uint8Array}  buffer          second Uint8Array.
   * @return  {ArrayBuffer}                  The new ArrayBuffer
   */
  function makeChunk(array1, array2) {
    const tmp = new Uint8Array(array1.byteLength + array2.byteLength);
    tmp.set(array1, 0);
    tmp.set(array2, array1.byteLength);
    return tmp.buffer;
  }

  function makeSaveChunk(chunkArrayBuffers, tagsUInt8Array, sourceUInt8Array) {
    return function saveChunk(chunk) {
      chunkArrayBuffers.push(
        makeChunk(
          tagsUInt8Array,
          sourceUInt8Array.subarray(
            chunk.frames[0]._section.offset,
            chunk.frames[chunk.frames.length - 1]._section.offset +
              chunk.frames[chunk.frames.length - 1]._section.byteLength
          )
        )
      );
    };
  }

  function emptyChunk(chunk) {
    chunk.byteLength = 0;
    chunk.frames.length = 0;
  }

  function addChunkFrame(chunk, frame) {
    chunk.byteLength = chunk.byteLength + frame._section.byteLength;
    chunk.frames.push(frame);
  }

  const asyncWorker = (source, items, fn, output) => async () => {
    let next;
    while ((next = items.pop())) {
      output[source.get(next)] = await fn(next);
    }
  };

  function getArrayBuffer(file) {
    return new Promise((resolve) => {
      let fileReader = new FileReader();
      fileReader.onloadend = () => {
        resolve(fileReader.result);
      };
      fileReader.readAsArrayBuffer(file);
    });
  }

  // Use a promise wrapper on top of event based syntax
  // for browsers (Safari) which do not support promise-based syntax.
  function decodeArrayBuffer(audioCtx, arrayBuffer) {
    return new Promise(audioCtx.decodeAudioData.bind(audioCtx, arrayBuffer));
  }

  async function getFileAudioBuffer(file, audioCtx, options = {}) {
    /* Copyright (c) 2019, Timothée 'Tim' Pillard, @ziir @tpillard - ISC */

    const { native = false, concurrency = CONCURRENCY } = options;

    const arrayBuffer = await getArrayBuffer(file);

    if (native) {
      return decodeArrayBuffer(audioCtx, arrayBuffer);
    }

    const safari = !!window.webkitAudioContext;
    if (safari) {
      return getFileAudioBuffer(file, audioCtx, { native: true });
    }

    const view = new DataView(arrayBuffer);

    const tags = main.readTags(view);
    const firstFrame = tags.pop();
    const uInt8Array = new Uint8Array(arrayBuffer);
    const tagsUInt8Array = uInt8Array.subarray(0, firstFrame._section.offset);
    const chunkArrayBuffers = [];
    const saveChunk = makeSaveChunk(
      chunkArrayBuffers,
      tagsUInt8Array,
      uInt8Array
    );
    let chunk = { byteLength: 0, frames: [] };
    let next = firstFrame._section.offset + firstFrame._section.byteLength;
    while (next) {
      const frame = main.readFrame(view, next);
      next = frame && frame._section.nextFrameIndex;

      if (frame) {
        const chunkEnd =
          chunk && chunk.byteLength + frame._section.byteLength >= CHUNK_MAX_SIZE;
        if (chunkEnd) {
          saveChunk(chunk);
          emptyChunk(chunk);
        }

        addChunkFrame(chunk, frame);
      }

      if (chunk && (!frame || !next)) {
        saveChunk(chunk);
      }
    }

    const workers = [];
    const source = new Map(chunkArrayBuffers.map((chunk, idx) => [chunk, idx]));
    const audioBuffers = new Array(chunkArrayBuffers.length);
    const decode = decodeArrayBuffer.bind(null, audioCtx);

    for (let i = 0; i < Math.min(concurrency, source.size); i++) {
      workers.push(
        asyncWorker(source, chunkArrayBuffers, decode, audioBuffers)()
      );
    }
    await Promise.all(workers);

    const { numberOfChannels, sampleRate } = audioBuffers[0];
    let length = audioBuffers.reduce((acc, current) => acc + current.length, 0);

    const audioBuffer = audioCtx.createBuffer(
      numberOfChannels,
      length,
      sampleRate
    );

    for (let j = 0; j < numberOfChannels; j++) {
      const channelData = audioBuffer.getChannelData(j);
      let offset = 0;
      for (let i = 0; i < audioBuffers.length; i++) {
        channelData.set(audioBuffers[i].getChannelData(j), offset);
        offset += audioBuffers[i].length;
      }
    }

    return audioBuffer;
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

  function getFileAudioBuffer$1(file, audioCtx, opts) {
    return getFileAudioBuffer(file, audioCtx, opts).catch((err) => {
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

  var punycode = createCommonjsModule(function (module, exports) {
  (function(root) {

  	/** Detect free variables */
  	var freeExports =  exports &&
  		!exports.nodeType && exports;
  	var freeModule =  module &&
  		!module.nodeType && module;
  	var freeGlobal = typeof commonjsGlobal == 'object' && commonjsGlobal;
  	if (
  		freeGlobal.global === freeGlobal ||
  		freeGlobal.window === freeGlobal ||
  		freeGlobal.self === freeGlobal
  	) {
  		root = freeGlobal;
  	}

  	/**
  	 * The `punycode` object.
  	 * @name punycode
  	 * @type Object
  	 */
  	var punycode,

  	/** Highest positive signed 32-bit float value */
  	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

  	/** Bootstring parameters */
  	base = 36,
  	tMin = 1,
  	tMax = 26,
  	skew = 38,
  	damp = 700,
  	initialBias = 72,
  	initialN = 128, // 0x80
  	delimiter = '-', // '\x2D'

  	/** Regular expressions */
  	regexPunycode = /^xn--/,
  	regexNonASCII = /[^\x20-\x7E]/, // unprintable ASCII chars + non-ASCII chars
  	regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g, // RFC 3490 separators

  	/** Error messages */
  	errors = {
  		'overflow': 'Overflow: input needs wider integers to process',
  		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
  		'invalid-input': 'Invalid input'
  	},

  	/** Convenience shortcuts */
  	baseMinusTMin = base - tMin,
  	floor = Math.floor,
  	stringFromCharCode = String.fromCharCode,

  	/** Temporary variable */
  	key;

  	/*--------------------------------------------------------------------------*/

  	/**
  	 * A generic error utility function.
  	 * @private
  	 * @param {String} type The error type.
  	 * @returns {Error} Throws a `RangeError` with the applicable error message.
  	 */
  	function error(type) {
  		throw new RangeError(errors[type]);
  	}

  	/**
  	 * A generic `Array#map` utility function.
  	 * @private
  	 * @param {Array} array The array to iterate over.
  	 * @param {Function} callback The function that gets called for every array
  	 * item.
  	 * @returns {Array} A new array of values returned by the callback function.
  	 */
  	function map(array, fn) {
  		var length = array.length;
  		var result = [];
  		while (length--) {
  			result[length] = fn(array[length]);
  		}
  		return result;
  	}

  	/**
  	 * A simple `Array#map`-like wrapper to work with domain name strings or email
  	 * addresses.
  	 * @private
  	 * @param {String} domain The domain name or email address.
  	 * @param {Function} callback The function that gets called for every
  	 * character.
  	 * @returns {Array} A new string of characters returned by the callback
  	 * function.
  	 */
  	function mapDomain(string, fn) {
  		var parts = string.split('@');
  		var result = '';
  		if (parts.length > 1) {
  			// In email addresses, only the domain name should be punycoded. Leave
  			// the local part (i.e. everything up to `@`) intact.
  			result = parts[0] + '@';
  			string = parts[1];
  		}
  		// Avoid `split(regex)` for IE8 compatibility. See #17.
  		string = string.replace(regexSeparators, '\x2E');
  		var labels = string.split('.');
  		var encoded = map(labels, fn).join('.');
  		return result + encoded;
  	}

  	/**
  	 * Creates an array containing the numeric code points of each Unicode
  	 * character in the string. While JavaScript uses UCS-2 internally,
  	 * this function will convert a pair of surrogate halves (each of which
  	 * UCS-2 exposes as separate characters) into a single code point,
  	 * matching UTF-16.
  	 * @see `punycode.ucs2.encode`
  	 * @see <https://mathiasbynens.be/notes/javascript-encoding>
  	 * @memberOf punycode.ucs2
  	 * @name decode
  	 * @param {String} string The Unicode input string (UCS-2).
  	 * @returns {Array} The new array of code points.
  	 */
  	function ucs2decode(string) {
  		var output = [],
  		    counter = 0,
  		    length = string.length,
  		    value,
  		    extra;
  		while (counter < length) {
  			value = string.charCodeAt(counter++);
  			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
  				// high surrogate, and there is a next character
  				extra = string.charCodeAt(counter++);
  				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
  					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
  				} else {
  					// unmatched surrogate; only append this code unit, in case the next
  					// code unit is the high surrogate of a surrogate pair
  					output.push(value);
  					counter--;
  				}
  			} else {
  				output.push(value);
  			}
  		}
  		return output;
  	}

  	/**
  	 * Creates a string based on an array of numeric code points.
  	 * @see `punycode.ucs2.decode`
  	 * @memberOf punycode.ucs2
  	 * @name encode
  	 * @param {Array} codePoints The array of numeric code points.
  	 * @returns {String} The new Unicode string (UCS-2).
  	 */
  	function ucs2encode(array) {
  		return map(array, function(value) {
  			var output = '';
  			if (value > 0xFFFF) {
  				value -= 0x10000;
  				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
  				value = 0xDC00 | value & 0x3FF;
  			}
  			output += stringFromCharCode(value);
  			return output;
  		}).join('');
  	}

  	/**
  	 * Converts a basic code point into a digit/integer.
  	 * @see `digitToBasic()`
  	 * @private
  	 * @param {Number} codePoint The basic numeric code point value.
  	 * @returns {Number} The numeric value of a basic code point (for use in
  	 * representing integers) in the range `0` to `base - 1`, or `base` if
  	 * the code point does not represent a value.
  	 */
  	function basicToDigit(codePoint) {
  		if (codePoint - 48 < 10) {
  			return codePoint - 22;
  		}
  		if (codePoint - 65 < 26) {
  			return codePoint - 65;
  		}
  		if (codePoint - 97 < 26) {
  			return codePoint - 97;
  		}
  		return base;
  	}

  	/**
  	 * Converts a digit/integer into a basic code point.
  	 * @see `basicToDigit()`
  	 * @private
  	 * @param {Number} digit The numeric value of a basic code point.
  	 * @returns {Number} The basic code point whose value (when used for
  	 * representing integers) is `digit`, which needs to be in the range
  	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
  	 * used; else, the lowercase form is used. The behavior is undefined
  	 * if `flag` is non-zero and `digit` has no uppercase form.
  	 */
  	function digitToBasic(digit, flag) {
  		//  0..25 map to ASCII a..z or A..Z
  		// 26..35 map to ASCII 0..9
  		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
  	}

  	/**
  	 * Bias adaptation function as per section 3.4 of RFC 3492.
  	 * https://tools.ietf.org/html/rfc3492#section-3.4
  	 * @private
  	 */
  	function adapt(delta, numPoints, firstTime) {
  		var k = 0;
  		delta = firstTime ? floor(delta / damp) : delta >> 1;
  		delta += floor(delta / numPoints);
  		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
  			delta = floor(delta / baseMinusTMin);
  		}
  		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
  	}

  	/**
  	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
  	 * symbols.
  	 * @memberOf punycode
  	 * @param {String} input The Punycode string of ASCII-only symbols.
  	 * @returns {String} The resulting string of Unicode symbols.
  	 */
  	function decode(input) {
  		// Don't use UCS-2
  		var output = [],
  		    inputLength = input.length,
  		    out,
  		    i = 0,
  		    n = initialN,
  		    bias = initialBias,
  		    basic,
  		    j,
  		    index,
  		    oldi,
  		    w,
  		    k,
  		    digit,
  		    t,
  		    /** Cached calculation results */
  		    baseMinusT;

  		// Handle the basic code points: let `basic` be the number of input code
  		// points before the last delimiter, or `0` if there is none, then copy
  		// the first basic code points to the output.

  		basic = input.lastIndexOf(delimiter);
  		if (basic < 0) {
  			basic = 0;
  		}

  		for (j = 0; j < basic; ++j) {
  			// if it's not a basic code point
  			if (input.charCodeAt(j) >= 0x80) {
  				error('not-basic');
  			}
  			output.push(input.charCodeAt(j));
  		}

  		// Main decoding loop: start just after the last delimiter if any basic code
  		// points were copied; start at the beginning otherwise.

  		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

  			// `index` is the index of the next character to be consumed.
  			// Decode a generalized variable-length integer into `delta`,
  			// which gets added to `i`. The overflow checking is easier
  			// if we increase `i` as we go, then subtract off its starting
  			// value at the end to obtain `delta`.
  			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

  				if (index >= inputLength) {
  					error('invalid-input');
  				}

  				digit = basicToDigit(input.charCodeAt(index++));

  				if (digit >= base || digit > floor((maxInt - i) / w)) {
  					error('overflow');
  				}

  				i += digit * w;
  				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

  				if (digit < t) {
  					break;
  				}

  				baseMinusT = base - t;
  				if (w > floor(maxInt / baseMinusT)) {
  					error('overflow');
  				}

  				w *= baseMinusT;

  			}

  			out = output.length + 1;
  			bias = adapt(i - oldi, out, oldi == 0);

  			// `i` was supposed to wrap around from `out` to `0`,
  			// incrementing `n` each time, so we'll fix that now:
  			if (floor(i / out) > maxInt - n) {
  				error('overflow');
  			}

  			n += floor(i / out);
  			i %= out;

  			// Insert `n` at position `i` of the output
  			output.splice(i++, 0, n);

  		}

  		return ucs2encode(output);
  	}

  	/**
  	 * Converts a string of Unicode symbols (e.g. a domain name label) to a
  	 * Punycode string of ASCII-only symbols.
  	 * @memberOf punycode
  	 * @param {String} input The string of Unicode symbols.
  	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
  	 */
  	function encode(input) {
  		var n,
  		    delta,
  		    handledCPCount,
  		    basicLength,
  		    bias,
  		    j,
  		    m,
  		    q,
  		    k,
  		    t,
  		    currentValue,
  		    output = [],
  		    /** `inputLength` will hold the number of code points in `input`. */
  		    inputLength,
  		    /** Cached calculation results */
  		    handledCPCountPlusOne,
  		    baseMinusT,
  		    qMinusT;

  		// Convert the input in UCS-2 to Unicode
  		input = ucs2decode(input);

  		// Cache the length
  		inputLength = input.length;

  		// Initialize the state
  		n = initialN;
  		delta = 0;
  		bias = initialBias;

  		// Handle the basic code points
  		for (j = 0; j < inputLength; ++j) {
  			currentValue = input[j];
  			if (currentValue < 0x80) {
  				output.push(stringFromCharCode(currentValue));
  			}
  		}

  		handledCPCount = basicLength = output.length;

  		// `handledCPCount` is the number of code points that have been handled;
  		// `basicLength` is the number of basic code points.

  		// Finish the basic string - if it is not empty - with a delimiter
  		if (basicLength) {
  			output.push(delimiter);
  		}

  		// Main encoding loop:
  		while (handledCPCount < inputLength) {

  			// All non-basic code points < n have been handled already. Find the next
  			// larger one:
  			for (m = maxInt, j = 0; j < inputLength; ++j) {
  				currentValue = input[j];
  				if (currentValue >= n && currentValue < m) {
  					m = currentValue;
  				}
  			}

  			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
  			// but guard against overflow
  			handledCPCountPlusOne = handledCPCount + 1;
  			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
  				error('overflow');
  			}

  			delta += (m - n) * handledCPCountPlusOne;
  			n = m;

  			for (j = 0; j < inputLength; ++j) {
  				currentValue = input[j];

  				if (currentValue < n && ++delta > maxInt) {
  					error('overflow');
  				}

  				if (currentValue == n) {
  					// Represent delta as a generalized variable-length integer
  					for (q = delta, k = base; /* no condition */; k += base) {
  						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
  						if (q < t) {
  							break;
  						}
  						qMinusT = q - t;
  						baseMinusT = base - t;
  						output.push(
  							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
  						);
  						q = floor(qMinusT / baseMinusT);
  					}

  					output.push(stringFromCharCode(digitToBasic(q, 0)));
  					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
  					delta = 0;
  					++handledCPCount;
  				}
  			}

  			++delta;
  			++n;

  		}
  		return output.join('');
  	}

  	/**
  	 * Converts a Punycode string representing a domain name or an email address
  	 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
  	 * it doesn't matter if you call it on a string that has already been
  	 * converted to Unicode.
  	 * @memberOf punycode
  	 * @param {String} input The Punycoded domain name or email address to
  	 * convert to Unicode.
  	 * @returns {String} The Unicode representation of the given Punycode
  	 * string.
  	 */
  	function toUnicode(input) {
  		return mapDomain(input, function(string) {
  			return regexPunycode.test(string)
  				? decode(string.slice(4).toLowerCase())
  				: string;
  		});
  	}

  	/**
  	 * Converts a Unicode string representing a domain name or an email address to
  	 * Punycode. Only the non-ASCII parts of the domain name will be converted,
  	 * i.e. it doesn't matter if you call it with a domain that's already in
  	 * ASCII.
  	 * @memberOf punycode
  	 * @param {String} input The domain name or email address to convert, as a
  	 * Unicode string.
  	 * @returns {String} The Punycode representation of the given domain name or
  	 * email address.
  	 */
  	function toASCII(input) {
  		return mapDomain(input, function(string) {
  			return regexNonASCII.test(string)
  				? 'xn--' + encode(string)
  				: string;
  		});
  	}

  	/*--------------------------------------------------------------------------*/

  	/** Define the public API */
  	punycode = {
  		/**
  		 * A string representing the current Punycode.js version number.
  		 * @memberOf punycode
  		 * @type String
  		 */
  		'version': '1.4.1',
  		/**
  		 * An object of methods to convert from JavaScript's internal character
  		 * representation (UCS-2) to Unicode code points, and back.
  		 * @see <https://mathiasbynens.be/notes/javascript-encoding>
  		 * @memberOf punycode
  		 * @type Object
  		 */
  		'ucs2': {
  			'decode': ucs2decode,
  			'encode': ucs2encode
  		},
  		'decode': decode,
  		'encode': encode,
  		'toASCII': toASCII,
  		'toUnicode': toUnicode
  	};

  	/** Expose `punycode` */
  	// Some AMD build optimizers, like r.js, check for specific condition patterns
  	// like the following:
  	if (freeExports && freeModule) {
  		if (module.exports == freeExports) {
  			// in Node.js, io.js, or RingoJS v0.8.0+
  			freeModule.exports = punycode;
  		} else {
  			// in Narwhal or RingoJS v0.7.0-
  			for (key in punycode) {
  				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
  			}
  		}
  	} else {
  		// in Rhino or a web browser
  		root.punycode = punycode;
  	}

  }(commonjsGlobal));
  });

  function getDisplayName(str) {
    let ret = str;
    try {
      ret = punycode.decode(str);
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
        this.audioBuffer = await getFileAudioBuffer$1(this.file, this.audioCtx);
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

})));
//# sourceMappingURL=audio-waveform-player-element.standalone.umd.js.map
