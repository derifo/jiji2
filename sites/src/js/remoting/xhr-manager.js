import ContainerJS from "container-js";
import XhrRequest  from "./xhr-request";
import Observable  from "../utils/observable";
import Urls        from "../utils/urls";
import Error       from "../model/error";

const defaultOptions = {
  timeout: 1000 * 60 * 3,
  isBackground: false
}

const States = {
  ACCEPTING: {
    send(request, manager) {
      request.send();
    },
    handleError(request, error, manager) {
      if (isRetryable(manager, request, error)) {
        manager.stop();
        manager.queue.push(request);
        manager.fire("startBlocking");
      } else {
        request.result().reject(error);
        manager.fire("fail", error);
      }
    }
  },
  BLOCKING: {
    send(request, manager) {
      if (request.isAuthRequest()) {
        request.send();
      } else {
        manager.queue.push(request);
      }
    },
    handleError(request, error, manager) {
      if (isRetryable(manager, request, error)) {
        manager.queue.push(request);
      } else {
        request.result().reject(error);
        manager.fire("fail", error);
      }
    }
  }
};

function isUnauthorized(error) {
  return error.code === Error.Code.UNAUTHORIZED;
}

function isRetryable(manager, request, error) {
  return manager.supportRelogin
      && !request.isAuthRequest()
      && isUnauthorized(error);
}

export default class XhrManager extends Observable {

  constructor() {
    super();
    this.sessionManager  = ContainerJS.Inject;
    this.googleAnalytics = ContainerJS.Inject;

    this.supportRelogin = false;
    // 再ログインサポートを有効にするかどうか
    // trueにすると、サーバーから401が返された際に
    // ブロッキングモードになり、再ログインの完了を待つようになります。

    this.queue = [];
    this.state = States.ACCEPTING;

    this.loaderCount = 0;
  }

  xhr(url, method, body = null, options = defaultOptions ) {
    const request = new XhrRequest(this, url, method, body, options);
    return this.handleRequest(request);
  }
  handleRequest(request) {
    this.state.send(request, this);
    return request.result();
  }

  restart() {
    this.state = States.ACCEPTING;

    for (let i = 0, n = this.queue.length; i < n; i++) {
      if (this.queue[i].resendable()) {
        this.queue[i].send();
      } else {
        this.queue[i].cancel();
      }
    }
    this.queue = [];
    this.fire("endBlocking");
  }
  cancel() {
    this.state = States.ACCEPTING;
    for (var i = 0, n = this.queue.length; i < n; i++) {
      this.queue[i].cancel();
    }
    this.queue = [];
  }
  stop() {
    this.state = States.BLOCKING;
  }

  handleResponse(request, response) {
    this.recordTime( request, response );
    request.deferred.resolve(response);
  }
  handleError(request, error) {
    this.recordError( request, error );
    this.state.handleError(request, error, this);
  }


  recordTime( request, response ) {
    try {
      const path = request.method + " "
        + Urls.extractNormarizedPathName(request.url);
      const time = new Date().getTime() - request.start;
      this.googleAnalytics.sendTiming("REST", path, time, path);
    } catch (er) {}
  }

  recordError( request, error ) {
    try {
      const statusCode = (error.response && error.response.statusCode);
      const msg = "" + statusCode + " " + request.method +  " "
              + Urls.extractNormarizedPathName(request.url);
      this.googleAnalytics.sendError(
        msg,
        statusCode ? statusCode >= 500 : true );
    } catch (er) {}
  }

  startLoading() {
    this.loaderCount += 1;
    if (this.loaderCount === 1) {
      this.fire("startLoading");
    }
  }
  endLoading() {
    this.loaderCount -= 1;
    if (this.loaderCount < 0) {
      this.loaderCount = 0;
    }
    if (this.loaderCount === 0) {
      this.fire("endLoading");
    }
  }
  isLoading() {
    return this.loaderCount > 0;
  }
}
