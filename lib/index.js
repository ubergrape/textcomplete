/* jshint browser: true */

var query = require('query')
var keyname = require('keyname')
var closest = require('closest')
var Classes = require('classes')
var debounce = require('debounce')
var next = require('next-sibling')
var prev = require('previous-sibling')
var Caret = require('caret');

// ignore these keys from triggering a match
var ignore = [
  'down',
  'up',
  'esc',
  'enter',
  'tab',
  'capslock',
  'meta',
  'shift',
  'ctrl',
  'alt',
  'meta',
  'pageup',
  'pagedown',
  'end',
  'home',
  'ins',
  'del',
  'left',
  'right'
]

module.exports = Textcomplete

Textcomplete.prototype = Object.create(require('complement'))

function Textcomplete(el, wrapper) {
  if (!(this instanceof Textcomplete))
    return new Textcomplete(el, wrapper)

  this.el = el
  this.parent = wrapper;

  this.is_textarea = (el.nodeName.toLowerCase() == "textarea")

  // you can set your own wrapper element
  if (!wrapper) {
    wrapper = document.createElement('div')
    el.parentNode.insertBefore(wrapper, el)
    this.parent = wrapper;
  }

  // actual menu
  this.menu = query('.autocomplete', wrapper);
  if (typeof this.menu === 'undefined') {
    menu = document.createElement('div');
    Classes(menu).add('autocomplete');
    wrapper.appendChild(menu);
    this.menu = menu;
  }

  Classes(this.menu).add('Textcomplete-menu')

  // hidden on initialization
  this.classes = Classes(this.parent)
    .add('Textcomplete-hidden')

  // current options
  this.options = []
  // currently highlighted option
  this.highlighted = null

  // setup stuff
  var self = this

  // debounced version of query
  this._query = function (match) {
    self.query(match)
  }

  // setup complement methods
  this._onblur()
  this._setupoptions()

  // create caret
  this.caret = new Caret(el)

  // match on focus
  el.addEventListener('focus', function () {
    // the cursor is positioned on the next tick
    setTimeout(function () {
      self.match()
    }, 0)
  })

  // handle menu events when the menu is shown
  // future for performance:
  // - add and remove this listener on hide and show
  el.addEventListener('keydown', function (e) {
    if (!self.shown) return

    switch (keyname(e.which)) {
      case 'down':
        stop(e)
        self.next()
        return
      case 'up':
        stop(e)
        self.previous()
        return
      case 'esc':
        stop(e)
        self.hide()
        return
      case 'enter':
        stop(e)
        self.select(self.highlighted)
        return
      case 'tab':
        stop(e)
        self.select(self.highlighted)
        return
    }
  })

  // textcomplete on certain key strokes
  // uses `keyup` because the value has to be registered
  // before we can do anything
  // to do: throttle `.match()` for performance
  el.addEventListener('keyup', function (e) {
    if (!~ignore.indexOf(keyname(e.which))) self.match()
  })

  // highlight the currently hovered option
  this.menu.addEventListener('mousemove', function (e) {
    self.highlight(self.find(e.target))
  })
}

/**
 * Checks to see if the current text matches the given regexp.
 * If it does, it calls a search.
 */

Textcomplete.prototype.match = function () {
  var el = this.el
  var text = (this.is_textarea) ? el.value : textonly(el)
  if (!text) return // nothing to match
  var index = (this.is_textarea) ? el.selectionEnd : document.getSelection().anchorOffset // cursor index
  var start = (this.is_textarea) ? el.selectionStart : document.getSelection().focusOffset // cursor start
  // if text is selected, ignore
  if (start !== index) return this.hide()
  var head = (this.is_textarea) ? text.slice(0, index) : this.caret.textBefore()
  var match = this.re.exec(head)
  // hide the menu if there's no match
  if (!match) return this.hide()
  if (!this.is_textarea) {
    // save the caret node and position, because if user clicks results we lose it
    selection = document.getSelection()
    this.focusNode = selection.focusNode
    this.focusOffset = selection.focusOffset
  }
  // call a search on the current match
  this._query(match)
  return this
}

/**
 * Position the menu based on the parent.
 */

Textcomplete.prototype.position = function (top, left) {
  var style = this.menu.style
  style.top = top + 'px'
  style.left = left + 'px'
  return this
}

/**
 * Only clears `.Textcomplete-option`s.
 */

Textcomplete.prototype.clear = function () {
  this.options = []
  this.selected = this.highlighted = null
  var options = query.all('.Textcomplete-option', this.menu)
  for (var i = 0; i < options.length; i++) remove(options[i])
  return this
}

Textcomplete.prototype.show = function () {
  var classes = this.classes
  if (classes.has('Textcomplete-hidden')) {
    if (!this.selected) this.highlight(0)
    classes.remove('Textcomplete-hidden')
    this.shown = true
    this.emit('show')
  }
  return this
}

Textcomplete.prototype.hide = function () {
  if (!this.classes.has('Textcomplete-hidden')) {
    this.classes.add('Textcomplete-hidden')
    this.highlighted = null
    this.options.forEach(function (option) {
      Classes(option.el).remove('Textcomplete-highlighted')
    })
    this.clear()
    this.shown = false
    this.emit('hide')
  }
  return this
}

/**
 * Format the element of an option.
 * If you want to manipulate items yourself,
 * Use this method.
 */

Textcomplete.prototype.formatOption = function (option, el) {
  Classes(option.el = el).add('Textcomplete-option')
  el.setAttribute('data-Textcomplete-id', option.id)
  return option
}

Textcomplete.prototype.change_input = function(value){
	
	if (this.is_textarea) {
		var el = this.el;
		var text = el.value;
		var index = el.selectionEnd;
		var start = text.slice(0, index)
			.replace(this.re, value);
		var new_text = start + text.slice(index);
		el.value = new_text;
		el.setSelectionRange(start.length, start.length);
	} else {
		var node = this.focusNode;
		var index =  this.focusOffset;
		var text = node.nodeValue;
		var start = text.slice(0, index)
			.replace(this.re, value);
		var new_text =  start + text.slice(index);
		node.textContent = new_text;
		
		var range = document.createRange();
		range.selectNodeContents(this.el);
		range.collapse(false);
		var sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
	}
	this.match();
}

/**
 * When an option is set, i.e. actually emit a `change` event.
 */

Textcomplete.prototype.select = function (option) {
	if (!(option = this.highlight(option))) return
	var el = this.el
	this.selected = option

	if (option.type == 'query') {
		this.change_input(option.insert)

		this.emit('change', option)
		this.hide()
		return option
	}


  if (this.is_textarea) {
    var text = el.value
    var index = el.selectionEnd
    var start = text.slice(0, index)
      .replace(this.re, this.formatSelection(option))
    var new_text = start + " " + text.slice(index)

    el.value = new_text
    el.setSelectionRange(start.length, start.length)
  } else {
    var node = this.focusNode
    var index = this.focusOffset
    var text = node.nodeValue
    var start = text.slice(0, index)
      .replace(this.re, this.formatSelection(option))

    var new_text = start + "&nbsp;" + text.slice(index)

    replaceNodeWithHTML(node, new_text)

    // since we are dealing with nodes, this should not be needed anymore
    var new_el = query('.ac:not(.checked)', el) //TODO: REMOVE THIS HACK
    Classes(new_el).add('checked')
    this.caret.moveAfter(new_el.nextSibling)

  }

  this.emit('change', option)
  this.hide()
  return option
}
/**
 * Highlight an option
 */

Textcomplete.prototype.highlight = function (option) {
  if (!(option = this.get(option))) return
  this.emit('highlight', this.highlighted = option)
  var options = this.options
  var o
  var el = option.el
  for (var i = 0; i < options.length; i++) {
    var o = options[i].el
    var c = Classes(o)
    if (o==el) {
      c.add('Textcomplete-highlighted')
    } else {
      c.remove('Textcomplete-highlighted')
    }
  }

  return option
}

// highlight the next element
Textcomplete.prototype.next = function () {
  var highlighted = this.highlighted
  if (!highlighted) return
  return this.highlight(next(highlighted.el, '.Textcomplete-option'))
}

// highlight the previous element
Textcomplete.prototype.previous = function () {
  var highlighted = this.highlighted
  if (!highlighted) return
  return this.highlight(prev(highlighted.el, '.Textcomplete-option'))
}

Textcomplete.prototype.find = function (el) {
  return closest(el, '.Textcomplete-option', true)
}

function remove(el) {
  el.parentNode.removeChild(el)
}

function stop(e) {
  e.preventDefault()
  e.stopPropagation()
}

/**
 * return first level text only
 * if string parameter replaceElementsWith is set, other DOM nodes get replaced
 * by this string
 */
function textonly(el, replaceElementsWith) {
  var replaceElementsWith = replaceElementsWith || ''
  var children = new Array()
  for(var child in el.childNodes) {
    if(el.childNodes[child].nodeType == 3) {
      children.push(el.childNodes[child].nodeValue)
    }
  }
  return children.join(replaceElementsWith)
}

// TODO: find/make a component to do this?
function replaceNodeWithHTML(node, html) {
  var div = document.createElement('div');
  div.innerHTML = html
  var elements = div.childNodes
  var child

  if (node.previousSibling) {
    var previous = node.previousSibling
    node.parentNode.replaceChild(elements[0],node)
    child = previous.nextSibling
  } else {
    var parent = node.parentNode
    parent.replaceChild(elements[0],node)
    child = parent.firstChild
  }

  while (elements.length!=0) {
    child = after(child, elements[0])
  }
}

function after(el, node) {
  var parentNode = el.parentNode;
  var nextSibling = el.nextSibling;

  if (parentNode) {
    nextSibling
      ? parentNode.insertBefore(node, nextSibling)
      : parentNode.appendChild(node);
  }
  return el.nextSibling
}

var sPE
function supportsPlaintextEditables() {
  console.log(sPE);
  if (typeof sPE == 'undefined') {
    var div = document.createElement('div');
    div.setAttribute('contenteditable', 'PLAINTEXT-ONLY');
    sPE = (div.contentEditable === 'plaintext-only');
  }
  return sPE
}
