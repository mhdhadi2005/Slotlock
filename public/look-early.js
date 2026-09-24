// Runs in <head> before the page paints: applies the look this visitor picked
// on the public pages, so there's no flash of the default theme.
try {
  var l = localStorage.getItem("sl-look");
  if (l === "ink") document.documentElement.removeAttribute("data-look");
  else if (l === "blush" || l === "latte") document.documentElement.setAttribute("data-look", l);
} catch (e) {}
