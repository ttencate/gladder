document.addEventListener('DOMContentLoaded', function() {
  var scripts = document.getElementsByClassName('display-as-pre');
  for (var i = 0; i < scripts.length; ++i) {
    var script = scripts[i];
    var header = document.createElement('h3');
    header.innerHTML = script.id;
    script.parentNode.insertBefore(header);
    var codeNode = document.createElement('pre');
    codeNode.appendChild(document.createTextNode(script.innerHTML));
    script.parentNode.insertBefore(codeNode);
  }
});
