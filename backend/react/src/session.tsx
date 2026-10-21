import { installSessionRedirect } from "./api";
installSessionRedirect(window, (url) => location.assign(url));
