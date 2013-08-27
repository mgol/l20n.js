define(function (require, exports, module) {
  'use strict';

  var L20n = require('../l20n');
  var io = require('./platform/io');
  var Parser = require('./parser').Parser;
  var Locale = require('./context').Locale;
  var Resource = require('./context').Resource;
  var Compiler = require('./compiler').Compiler;

  var rtlLocales = ['ar', 'fa', 'he', 'ps', 'ur'];

  var resLinks = null;

  var locales = {};
  var curLocale = null;

  webL10nBridge();

  function setLocale(lang) {
    curLocale = lang;
    if (!resLinks) {
      indexResources(document, createLocale);
    } else {
      createLocale();
    }
  }

  function createLocale() {

    var parser = new Parser();
    var compiler = new Compiler();
    var locale = new Locale(curLocale, parser, compiler);

    resLinks[curLocale].forEach(function(res) {
      var resource = new Resource(res, parser);
      locale.resources.push(resource); 
    });

    locale.build();

    locales[curLocale] = locale;
    fireLocalizedEvent();
  }


  function webL10nBridge() {
    if (!navigator.mozL10n) {
      navigator.mozL10n = {
        get: function(id) {
          var entry = locales[curLocale].getEntry(id);
          if (!entry) {
            return null;
          }
          return entry.get().value;
        },
        localize: function() {},
        language: {
          get code() { return curLocale },
          set code(lang) {
            print(lang);
            setLocale(lang);
          },
          get direction() {
            // getting direction is the only way in BTO that we know
            // that we work on the default locale
            translateDocument();
            return (rtlLocales.indexOf(curLocale) >= 0) ? 'rtl' : 'ltr';
          },
        },
        getDictionary: getSubDictionary,
        ready: function() {},
      };
    }
  }

  function indexResources(doc, cb) {
    resLinks = {};
    var headNode = doc.head;
    var links = headNode.querySelectorAll('link[type="application/l10n"]');

    var iniToLoad = links.length;
    if (iniToLoad === 0) {
      return cb();
    }
    for (var i = 0; i < links.length; i++) {
      loadINI(links[i].getAttribute('href'), iniLoaded);
    };

    function iniLoaded(err) {
      if (err) {
        throw err;
      }
      iniToLoad--;
      if (iniToLoad == 0) {
        cb();
      }
    }
  }

  function loadINI(url, cb) {
    io.load(url, function iniLoaded(err, text) {
      var res = addResourcesFromINI(url, text);
      for (var loc in res) {
        if (!resLinks[loc]) {
          resLinks[loc] = [];
        }
        for (var r in res[loc]) {
          resLinks[loc].push(res[loc][r]);
        }
      }
      cb();
    });
  }

  var patterns = {
    ini: {
      section: /^\s*\[(.*)\]\s*$/,
      import: /^\s*@import\s+url\((.*)\)\s*$/i,
      locale: /{{\s*locale\s*}}/,
    }
  }

  function addResourcesFromINI(iniPath, source) {
    var entries = source.split(/[\r\n]+/);
    var langs = ['en-US'];
    var currentLang = 'en-US';
    var resources = {'en-US': []};
    var match, uri;

    var genericSection = true;

    for (var i = 0; i < entries.length; i++) {
      var line = entries[i];
      if (patterns['ini']['section'].test(line)) {
        match = patterns['ini']['section'].exec(line);
        langs.push(match[1]);
        resources[match[1]] = [];
        currentLang = match[1];
        genericSection = false;
      }
      if (patterns['ini']['import'].test(line)) {
        match = patterns['ini']['import'].exec(line);
        uri = relativePath(iniPath, match[1]);
        resources[currentLang].push(uri);
      }
    }
    return resources;
  }

  function relativePath(baseUrl, url) {
    if (url[0] == '/') {
      return url;
    }
    var dirs = baseUrl.split('/')
      .slice(0, -1)
      .concat(url.split('/'))
      .filter(function(elem) {
        return elem !== '.';
      });

    if (dirs[0] !== '' && dirs[0] !== '..') {
      // if the base path doesn't start with / or ..
      dirs.unshift('.');
    }

    return dirs.join('/');
  }

  // return a sub-dictionary sufficient to translate a given fragment
  function getSubDictionary(fragment) {
    if (!fragment) { // by default, return a clone of the whole dictionary
      var dict = {};
      for (var id in locales[curLocale].entries) {
        dict[id] = {'_': navigator.mozL10n.get(id)};
      }
      return dict;
    }

    var dict = {};
    var elements = getTranslatableChildren(fragment);

    function checkGlobalArguments(str) {
      var match = getL10nArgs(str);
      for (var i = 0; i < match.length; i++) {
        var arg = match[i].name;
        if (arg in gL10nData) {
          dict[arg] = gL10nData[arg];
        }
      }
    }

    for (var i = 0, l = elements.length; i < l; i++) {
      var id = getL10nAttributes(elements[i]).id;
      var data = navigator.mozL10n.get(id);
      if (!id || !data) {
        continue;
      }

      dict[id] = {'_': data};
      for (var prop in data) {
        var str = data[prop];
        //checkGlobalArguments(str);

        /*if (reIndex.test(str)) { // macro index
          for (var j = 0; j < kPluralForms.length; j++) {
            var key = id + '[' + kPluralForms[j] + ']';
            if (key in gL10nData) {
              dict[key] = gL10nData[key];
              checkGlobalArguments(gL10nData[key]);
            }
          }
        }*/
      }
    }

    return dict;
  }

  function getTranslatableChildren(element) {
    return element ? element.querySelectorAll('*[data-l10n-id]') : [];
  }


  function getL10nAttributes(element) {
    if (!element) {
      return {};
    }

    var l10nId = element.getAttribute('data-l10n-id');
    var l10nArgs = element.getAttribute('data-l10n-args');
    var args = {};
    if (l10nArgs) {
      try {
        args = JSON.parse(l10nArgs);
      } catch (e) {
        consoleWarn('could not parse arguments for #' + l10nId);
      }
    }
    return { id: l10nId, args: args };
  }

  function translateDocument() {
    var nodes = document.querySelectorAll('[data-l10n-id]');
    for (var i = 0; i < nodes.length; i++) {
      translateNode(nodes[i], nodes[i].getAttribute('data-l10n-id'));
    }
  }

  function translateNode(node, id) {
    var entity = locales[curLocale].getEntry(id).get();

    if (entity.value) {
      node.textContent = entity.value;
    }
  }

  function fireLocalizedEvent() {
    var event = document.createEvent('Event');
    event.initEvent('localized', false, false);
    event.langauge = curLocale;
    window.dispatchEvent(event);
  }

  return L20n;
});