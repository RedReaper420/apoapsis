
export const APP_VERSION = "0.9.1";

window.apoapsis_version = () => { return APP_VERSION; };

Array.from(document.getElementsByClassName('version')).forEach(el => {
    el.innerText = APP_VERSION;
});
