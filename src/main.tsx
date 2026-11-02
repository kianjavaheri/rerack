// Entry for index.html. On the website, `/` is the landing page for new visitors (the inline script in index.html
// decides, before anything loads, and adds `landing` to <html>); then the app's code isn't even downloaded. Everywhere
// else (any other path, returning users, the home-screen web app, the iPhone app) the app starts.
if (!document.documentElement.classList.contains('landing')) void import('./boot');
