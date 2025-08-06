
//Automaticall resize textarea as you type:===========
var observe;
if (window.attachEvent) {
    observe = function (element, event, handler) {
        element.attachEvent('on'+event, handler);
    };
}
else {
    observe = function (element, event, handler) {
        element.addEventListener(event, handler, false);
    };
}
autoSizeTextarea = function(text, parent) {
    // var text = document.getElementById('content');
    function resize () {
        var scroll_y=parent.scrollTop();
        text.style.height = 'auto';
        text.style.height = text.scrollHeight+10+'px';
        parent.scrollTop(scroll_y);
    }
    /* 0-timeout to get the already changed text */
    function delayedResize () {
        window.setTimeout(resize, 0);
    }
    observe(text, 'change',  resize);
    observe(text, 'cut',     delayedResize);
    observe(text, 'paste',   delayedResize);
    observe(text, 'drop',    delayedResize);
    observe(text, 'keydown', delayedResize);

    text.focus();
    // text.select();
    resize();
}
//====================================================