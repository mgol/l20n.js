'use strict'
L20n.Parser = function() {
  let content = null;
  let patterns = {
    id: /^([_a-zA-Z]\w*)/,
    value: /^(["'])([^'"]*)(["'])/,
    ws: /^\s+/
  }

  function parse(string) {
    let lol = {type: 'LOL',
               body: []}
    content = string
    get_ws();
    while (content) {
      lol.body.push(get_entry())
      get_ws();
    }
    return lol
  }

  function get_ws() {
    content = content.replace(patterns['ws'], '')  
  }

  function get_entry() {
    let entry
    if (content[0] == '<') {
      content = content.substr(1)
      let id = get_identifier()
      if (content[0] == '(') {
        entry = get_macro(id)
      } else if (content[0] == '[') {
        let index = get_index()
        entry = get_entity(id, index)
      } else {
        entry = get_entity(id);
      }
    } else if (content.substr(0,2) == '/*') {
      entry = get_comment();
    } else if (content.substr(0,6) == 'import') {
      entry = get_importstatement()
    } else {
      throw "ParserError at get_entry"
    }
    return entry
  }

  function get_importstatement() {
    content = content.substr(6)
    get_ws()
    if (content[0] != '(') {
      throw "ParserError"
    }
    content = content.substr(1)
    get_ws()
    let uri = get_string()
    get_ws()
    if (content[0] != ')') {
      throw "ParserError"
    }
    content = content.substr(1)
    let impStmt = {
      type: 'ImportStatement',
      uri: uri
    }
    return impStmt
  }

  function get_identifier() {
    if (content[0] == '~') {
      // this expression
    }
    let match = patterns['id'].exec(content)
    if (!match)
      throw "ParserError"
    content = content.substr(match[0].length)
    let identifier = {type: 'Identifier',
                  name: match[0]}
    return identifier
  }

  function get_entity(id, index) {
    let ch = content[0]
    get_ws();
    if (content[0] == '>') {
      // empty entity
    }
    if (!/\s/g.test(ch)) {
      throw "ParserError at get_entity"
    }
    let value = get_value(true)
    get_ws()
    let attrs = get_attributes()
    let entity = {
      type: 'Entity',
      id: id,
      value: value,
      index: index || [],
      attrs: attrs,
      local: (id.name[0] == '_')
    }
    return entity
  }

  function get_value(none) {
    let c = content[0]
    let value
    if (c == '"' || c == "'") {
      let ccc = content.substr(3)
      let quote = (ccc == '"""' || ccc == "'''")?ccc:c
      //let value = get_string()
      value = get_complex_string(quote)
    } else if (c == '[') {
      value = get_array()
    } else if (c == '{') {
      value = get_hash()
    }
    return value
  }

  function get_string() {
    let match = patterns['value'].exec(content)
    if (!match) {
      throw "ParserError"
    }
    content = content.substr(match[0].length)
    return {type: 'String', content: match[2]}
  }

  function get_complex_string(quote) {
    let str_end = quote[0]
    let literal = new RegExp("^([^\\\{"+str_end+"]+)")
    let obj = []
    let buffer = ''
    content = content.substr(quote.length)
    let i = 0
    while (content.substr(0, quote.length) != quote) {
      i++;
      if (i>20)
        break
      if (content[0] == str_end) {
        buffer += content[0]
        content = content.substr(1)
      }
      if (content[0] == '\\') {
        let jump = content.substr(1, 3) == '{{' ? 3 : 2;
        buffer += content.substr(1, jump)
        content = content.substr(jump)
      }
      if (content.substr(0, 2) == '{{') {
        content = content.substr(2)
        if (buffer) {
          let string = {type: 'String', content: buffer}
          obj.push(string)
          buffer = ''
        }
        get_ws()
        let expr = get_expression()
        obj.push(expr)
        if (content.substr(0, 2) != '}}') {
          throw "ParserError at get_complex_string"
        }
        content = content.substr(2)
      }
      let m = literal.exec(content)
      if (m) {
        buffer = m[1]
        content = content.substr(m[0].length)
      }
    }
    if (buffer) {
      let string = {type: 'String', content: buffer}
      obj.push(string)
    }
    content = content.substr(quote.length)
    if (obj.length == 1 && obj[0].type == 'String') {
      return obj[0]
    }
    let cs = {type: 'ComplexString', content: obj}
    return cs
  }

  function get_hash() {
    content = content.substr(1)
    get_ws()
    if (content[0] == '}') {
      let h = {type: 'Hash', content: []}
      return h
    }
    let hash = []
    while (1) {
      let defitem = false
      if (content[0] == '*') {
        content = content.substr(1)
          defitem = true
      }
      let hi = get_kvp('HashItem')
      hi.default = defitem
      hash.push(hi)
      get_ws()
      if (content[0] == ',') {
        content = content.substr(1)
        get_ws()
      } else if (content[0] == '}') {
        break
      } else {
        throw "ParserError in get_hash"
      }
    }
    content = content.substr(1)
    let h = {type: 'Hash', content: hash}
    return h
  }

  function get_kvp(cl) {
    let key = get_identifier()
    get_ws()
    if (content[0] != ':') {
      throw "ParserError"
    }
    content = content.substr(1)
    get_ws()
    let val = get_value()
    let kvp = {type: cl, key: key, value: val}
    return kvp
  }

  function get_attributes() {
    if (content[0] == '>') {
      content = content.substr(1)
      return {}
    }
    let attrs = {}
    while (1) {
      let attr = get_kvp('Attribute')
      attr.local = attr.key.name[0] == '_'
      attrs[attr.key.name] = attr
      let ch = content[0]
      get_ws()
      if (content[0] == '>') {
        content = content.substr(1)
        break
      } else if (!/^\s/.test(ch)) {
        throw "ParserError"
      }
    }
    return attrs
  }

  function get_index() {
    content = content.substr(1)
    get_ws()
    let index = []
    if (content[0] == ']') {
      content = content.substr(1)
      return index
    }
    while (1) {
      let expression = get_expression()
      index.push(expression)
      get_ws()
      if (content[0] == ',') {
        content = content.substr(1)
      } else if (content[0] == ']') {
        break
      } else {
        throw "ParserError in get_index"
      }
    }
    content = content.substr(1)
    return index
  }

  function get_expression() {
    let exp = get_primary_expression()
    get_ws()
    return exp
  }

  function get_primary_expression() {
    if (content[0] == '$') {
      return get_variable()
    }
    if (content[0] == '@') {
      content = content.substr(1)
      let id = get_identifier()
      let ge = {type: 'GlobalsExpression', id: id}
      return ge
    }
    return get_identifier()
  }

  function get_variable() {
    content = content.substr(1)
    let id = get_identifier()
    let ve = {type: 'VariableExpression', id: id}
    return ve
  }

  return {
    parse: parse,
  }
} 