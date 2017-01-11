/*
  @author: GeoGebra - Dynamic Mathematics for Everyone, http://www.geogebra.org
  @license: This file is subject to the GeoGebra Non-Commercial License Agreement, see http://www.geogebra.org/license. For questions please write us at office@geogebra.org.
*/

/*global renderGGBElement, deployJava, XDomainRequest, ggbApplets, console */

var latestVersion="5.0.309.0";
var isRenderGGBElementEnabled = false;
var scriptLoadStarted = false;
var html5AppletsToProcess = null;
var ggbHTML5LoadedCodebaseIsWebSimple = false;
var ggbHTML5LoadedCodebaseVersion = null;
var ggbHTML5LoadedScript = null;

var ggbCompiledResourcesLoadFinished = false;
var ggbCompiledResourcesLoadInProgress = false;
var ggbCompiledAppletsLoaded = false;

/**
 * @param ggbVersion The version of the GeoGebraFile as string in the format x.x (e.g. '4.4'). If the version is not specified, the latest stable GeoGebraVersion is used (currently 4.4).
 * @param parameters An object containing parameters that are passed to the applet.
 * @param views An object containing information about which views are used in the GeoGebra worksheet. Each variable is boolean.
 *              E.g.: {"is3D":false,"AV":false,"SV":false,"CV":false,"EV2":false,"CP":false,"PC":false,"DA":false,"FI":false,"PV":false,"macro":false};
 * @param html5NoWebSimple Set to true to avoid using web Simple for simple html5 applets. In this case the full version is used always.
 */
var GGBApplet = function() {
    "use strict";
    var applet = {};

    // Define the parameters
    var ggbVersion = '5.0';
    var parameters = {};
    var views = null;
    var html5NoWebSimple = false;
    var html5NoWebSimpleParamExists = false;
    var appletID = null;
    var initComplete = false;
    var html5OverwrittenCodebaseVersion = null;
    var html5OverwrittenCodebase = null;

    for(var i=0; i<arguments.length; i++) {
        var p = arguments[i];
        if (p !== null) {
            switch(typeof(p)) {
                case 'number':
                    ggbVersion = p.toFixed(1);
                    break;
                case 'string':
                    // Check for a version number
                    if (p.match(new RegExp("^[0-9]\\.[0-9]+$"))) {
                        ggbVersion = p;
                    } else {
                        appletID = p;
                    }
                    break;
                case 'object':
                    if (typeof p.is3D !== "undefined") {
                        views = p;
                    } else {
                        parameters = p;
                    }
                    break;
                case 'boolean':
                    html5NoWebSimple = p;
                    html5NoWebSimpleParamExists = true;
                    break;
            }
        }
    }

    if (views === null) {
        views = {"is3D":false,"AV":false,"SV":false,"CV":false,"EV2":false,"CP":false,"PC":false,"DA":false,"FI":false,"PV":false,"macro":false};

        // don't use web simple when material is loaded from tube, because we don't know which views are used.
        if (parameters.material_id !== undefined && !html5NoWebSimpleParamExists) {
            html5NoWebSimple = true;
        }
    }

    if (appletID !== null && parameters.id === undefined) {
        parameters.id = appletID;
    }

    // Private members
    var jnlpFilePath = "";
    var html5Codebase = "";
    var javaCodebase = "";
    var isOverriddenJavaCodebase = false;
    var isHTML5Offline = false;
    var isJavaOffline = false;
    var loadedAppletType = null;
    var javaCodebaseVersion = null;
    var html5CodebaseVersion = null;
    var html5CodebaseScript = null;
    var html5CodebaseIsWebSimple = false;
    var previewImagePath = null;
    var previewLoadingPath = null;
    var previewPlayPath = null;
    var fonts_css_url = null;
    var jnlpBaseDir = null;
    var preCompiledScriptPath = null;
    var preCompiledResourcePath = null;
    var preCompiledScriptVersion = null;

    if (parameters.height !== undefined) {
        parameters.height = Math.round(parameters.height);
    }
    if (parameters.width !== undefined) {
        parameters.width = Math.round(parameters.width);
    }
    var parseVersion =function(d){
        return parseFloat(d)>4.0 ? parseFloat(d) : 5; 
    };
    /**
     * Overrides the codebase for HTML5.
     * @param codebase Can be an URL or a local file path.
     * @param offline Set to true, if the codebase is a local URL and no web URL
     */
    applet.setHTML5Codebase = function(codebase, offline) {
        html5OverwrittenCodebase = codebase;
        setHTML5CodebaseInternal(codebase, offline);
    };

    /**
     * Overrides the codebase version for Java.
     * @param version The version of the codebase that shoudl be used for java applets.
     */
    applet.setJavaCodebaseVersion = function(version) {
        javaCodebaseVersion = version;
        setDefaultJavaCodebaseForVersion(version);
    };

    /**
     * Overrides the codebase version for HTML5.
     * If another codebase than the default codebase should be used, this method has to be called before setHTML5Codebase.
     * @param version The version of the codebase that should be used for HTML5 applets.
     */
    applet.setHTML5CodebaseVersion = function(version, offline) {
        if (version==="4.2") {
            return;
        } // Version 4.2 is not working properly
        html5OverwrittenCodebaseVersion = version;
        setDefaultHTML5CodebaseForVersion(version, offline);
    };

    applet.getHTML5CodebaseVersion = function() {
        return html5CodebaseVersion;
    };

    applet.getParameters = function() {
        return parameters;
    };


    /**
     * Overrides the codebase for Java.
     * @param codebase Can be an URL or a local file path.
     * @param offline Set to true, if the codebase is a local URL and no web URL
     */
    applet.setJavaCodebase = function(codebase, offline) {
        isOverriddenJavaCodebase = true;

        if (codebase.slice(-1) === '/') {
            javaCodebaseVersion = codebase.slice(-4,-1);
        } else {
            javaCodebaseVersion = codebase.slice(-3);
        }

        if (offline === null) {
            offline = (codebase.indexOf("http") === -1);
        }
        if (offline && jnlpBaseDir !== null) {
            jnlpBaseDir = null;
        }

        doSetJavaCodebase(codebase, offline);
    };

    applet.setFontsCSSURL = function(url) {
        fonts_css_url = url;
    };

    /**
      * This function is not needed anymore. Keep it for downward compatibility of the API.
      */
    applet.setGiacJSURL = function(url) {
    };

    var doSetJavaCodebase = function(codebase, offline) {
        javaCodebase = codebase;

        // Check if the codebase is online or local
        isJavaOffline = offline;

        // Set the name of the JNLP file to the codebase directory
        if (jnlpBaseDir === null) {
            var dir='';
            if (isJavaOffline) {
                var loc = window.location.pathname;
                dir = loc.substring(0, loc.lastIndexOf('/'))+'/';
            }
            applet.setJNLPFile(dir+codebase+'/'+buildJNLPFileName(isJavaOffline));
        } else {
            applet.setJNLPFile(jnlpBaseDir+javaCodebaseVersion+'/'+buildJNLPFileName(isJavaOffline));
        }
    };

    /**
     * Overrides the JNLP file to use.
     * By default (if this method is not called), the jnlp file in the codebase directory is used.
     * Cannot be used in combination with setJNLPBaseDir
     * @param newJnlpFilePath The absolute path to the JNLP file.
     */
    applet.setJNLPFile = function(newJnlpFilePath) {
        jnlpFilePath = newJnlpFilePath;
    };

    /**
     * Sets an alternative base directory for the JNLP File. The path must not include the version number.
     * @param baseDir
     */
    applet.setJNLPBaseDir = function(baseDir) {
        jnlpBaseDir = baseDir;
        applet.setJNLPFile(jnlpBaseDir+javaCodebaseVersion+'/'+buildJNLPFileName(isJavaOffline));
    };

    /**
     * Injects the applet;
     * @param containerID The id of the HTML element that is the parent of the new applet.
     * All other content (innerText) of the container will be overwritten with the new applet.
     * @param type Can be 'preferJava', 'preferHTML5', 'java', 'html5', 'auto' or 'screenshot'. Default='auto';
     * @param boolean noPreview. Set to true if no preview image should be shown
     * @return The type of the applet that was injected or null if the applet could not be injected.
     */
    applet.inject = function() {
        function isOwnIFrame() {
            return window.frameElement && window.frameElement.getAttribute("data-singleton");
        }

        var type = 'auto';
        var container_ID = parameters.id;
        var container;
        var noPreview = false;
        for(var i=0; i<arguments.length; i++) {
            var p = arguments[i];
            if (typeof(p) === "string") {
                p = p.toLowerCase();
                if (p === 'preferjava' || p === 'preferhtml5' || p === 'java' || p === 'html5' || p === 'auto' || p === 'screenshot' || p === 'prefercompiled' || p === 'compiled') {
                    type = p;
                } else {
                    container_ID = arguments[i];
                }
            } else if (typeof(p) === "boolean") {
                noPreview = p;
            } else if (p instanceof HTMLElement) {
                container = p;
            }
        }

        continueInject();

        function continueInject() {
            // Check if the initialization is complete
            if (! initComplete) {
                // Try again in 200 ms.
                setTimeout(continueInject, 200);
                return;
            }

            // Use the container id as appletid, if it was not defined.
            type = detectAppletType(type); // Sets the type to either 'java' or 'html5'

            var appletElem = container || document.getElementById(container_ID);

            if (!appletElem) {
                console.log("possibly bug on ajax loading? ");
                return;
            }

            // Remove an existing applet
            applet.removeExistingApplet(appletElem, false);

            // Read the applet dimensions from the container, if they were not defined in the params
            //it is okay, but sadly no height of the container, so we must take care of this too - geogebraweb won't wet widht and height if one if it 0
            if (parameters.width === undefined && appletElem.clientWidth) {
                parameters.width = appletElem.clientWidth;
            }
            if (parameters.height === undefined && appletElem.clientHeight) {
                parameters.height = appletElem.clientHeight;
            }

            if (!(parameters.width && parameters.height) && type === "html5") {
                delete parameters.width;
                delete parameters.height;
            }

            // Inject the new applet
            loadedAppletType = type;
            if (type === "screenshot") {
                injectScreenshot(appletElem, parameters);
            } else if (type === "compiled") {
                injectCompiledApplet(appletElem, parameters, true);
            } else {
                // Check if applets should be loaded instantly or with a play button
                var playButton = false;
                if (parameters.hasOwnProperty("playButton") && parameters.playButton || parameters.hasOwnProperty("clickToLoad") && parameters.clickToLoad) {
                    playButton = true;
                } else if (parameters.hasOwnProperty("playButtonAutoDecide") && parameters.playButtonAutoDecide) {
                    playButton = (!isInIframe() || isOwnIFrame())  && isMobileDevice();
                }

                if (playButton) {
                    loadedAppletType = "screenshot";
                    injectPlayButton(appletElem, parameters, noPreview, type);
                } else if (type === "java") {
                    injectJavaApplet(appletElem, parameters);
                } else {
                    injectHTML5Applet(appletElem, parameters, noPreview);
                }
            }
        }

        return;
    };

    function isInIframe () {
        try {
            return window.self !== window.top;
        } catch (e) {
            return true;
        }
    }

    function isMobileDevice() {
        if (parameters.hasOwnProperty("screenshotGenerator") && parameters.screenshotGenerator) {
            return false;
        }
        return (Math.max(screen.width,screen.height) < 800);
    }

    applet.getViews = function() {
        return views;
    };

    /**
     * @returns boolean Whether the system is capable of showing the GeoGebra Java applet
     */
    applet.isJavaInstalled = function() {
        if (typeof deployJava === 'undefined') {
            // incase deployJava.js not available
            if (navigator.javaEnabled()) {
                // Check if IE is in metro mode
                if (isInternetExplorer() && getIEVersion() >= 10) {
                    if(window.innerWidth === screen.width && window.innerHeight === screen.height) {
                        return false;
                    }
                }

                // Check if on Android device
                if (navigator.userAgent.indexOf('Android ') > -1) {
                    return false;
                }

                // Check if the java plugin is installed
                if (!isInternetExplorer() && !pluginEnabled('java')) {
                    return false;
                }

                return true;
            }
        } else {
            return (deployJava.versionCheck("1.6.0+") || deployJava.versionCheck("1.4") || deployJava.versionCheck("1.5.0*"));
        }
    };

    function pluginEnabled(name) {
        var plugins = navigator.plugins,
            i = plugins.length,
            regExp = new RegExp(name, 'i');
        while (i--) {
            if (regExp.test(plugins[i].name)) {
                return true;
            }
        }
        return false;
    }

    var getTubeURL = function() {
        var tubeurl, protocol;
        // Determine the url for the tube API
        if (parameters.tubeurl !== undefined) {

            // Url was specified in parameters
            tubeurl = parameters.tubeurl;
        } else if (
            window.location.host.indexOf("www.geogebra.org") > -1 ||
            window.location.host.indexOf("www-beta.geogebra.org") > -1 ||
            window.location.host.indexOf("www-test.geogebra.org") > -1 ||
            window.location.host.indexOf("alpha.geogebra.org") > -1 ||
            window.location.host.indexOf("beta.geogebra.org") > -1 ||
            window.location.host.indexOf("tube.geogebra.org") > -1 ||
            window.location.host.indexOf("tube-beta.geogebra.org") > -1 ||
            window.location.host.indexOf("cloud.geogebra.org") > -1 ||
            window.location.host.indexOf("cloud-beta.geogebra.org") > -1 ||
            window.location.host.indexOf("cloud-stage.geogebra.org") > -1 ||
            window.location.host.indexOf("stage.geogebra.org") > -1 ||
            window.location.host.indexOf("tube-test.geogebra.org") > -1) {

            // if the script is used on a tube site, use this site for the api url.
            tubeurl = window.location.protocol + "//" + window.location.host;
        } else {
            // Use main tube url
            if (window.location.protocol.substr(0,4) === 'http') {
                protocol = window.location.protocol;
            } else {
                protocol = 'http:';
            }
            tubeurl = protocol+"//www.geogebra.org";
        }
        return tubeurl;
    };

    var fetchParametersFromTube = function(successCallback) {
        var tubeurl = getTubeURL();

        // load ggbbase64 string and settings from API
        var api_request = {
            "request": {
                "-api": "1.0.0",
                "login": {
                    "-type":"cookie",
                    "-getuserinfo":"false"
                },
                "task": {
                    "-type": "fetch",
                    "fields": {
                        "field": [
                            { "-name": "id" },
                            { "-name": "geogebra_format" },
//                            { "-name": "prefapplettype" },
                            { "-name": "width" },
                            { "-name": "height" },
                            { "-name": "toolbar" },
                            { "-name": "menubar" },
                            { "-name": "inputbar" },
                            { "-name": "reseticon" },
                            { "-name": "labeldrags" },
                            { "-name": "shiftdragzoom" },
                            { "-name": "rightclick" },
                            { "-name": "ggbbase64" },
                            { "-name": "preview_url" }
                        ]
                    },
                    "filters" : {
                        "field": [{
                                "-name":"id", "#text": ""+parameters.material_id+""
                        }]
                    },
                    "order": {
                        "-by": "id",
                        "-type": "asc"
                    },
                    "limit": { "-num": "1" }
                }
            }
        },

        // TODO: add prefapplet type (params:'type' API:'prefapplettype')
        // TODO: Read view settings from database

        success = function() {
            var text = xhr.responseText;
            var jsondata= JSON.parse(text); //retrieve result as an JSON object
            var item = null;
            for (i=0; i<jsondata.responses.response.length; i++) {
                if (jsondata.responses.response[i].item !== undefined) {
                    item = jsondata.responses.response[i].item;
                }
            }
            if (item === null) {
                onError();
                return;
            }

            if (item.geogebra_format !== "") {
                ggbVersion = item.geogebra_format;
            }
            if (parameters.ggbBase64 === undefined) {
                parameters.ggbBase64 = item.ggbBase64;
            }
            if (parameters.width === undefined) {
                parameters.width = item.width;
            }
            if (parameters.height === undefined) {
                parameters.height = item.height;
            }
            if (parameters.showToolBar === undefined) {
                parameters.showToolBar = item.toolbar === "true";
            }
            if (parameters.showMenuBar === undefined) {
                parameters.showMenuBar = item.menubar === "true";
            }
            if (parameters.showAlgebraInput === undefined) {
                parameters.showAlgebraInput = item.inputbar === "true";
            }
            if (parameters.showResetIcon === undefined) {
                parameters.showResetIcon = item.reseticon === "true";
            }
            if (parameters.enableLabelDrags === undefined) {
                parameters.enableLabelDrags = item.labeldrags === "true";
            }
            if (parameters.enableShiftDragZoom === undefined) {
                parameters.enableShiftDragZoom = item.shiftdragzoom === "true";
            }
            if (parameters.enableRightClick === undefined) {
                parameters.enableRightClick = item.rightclick === "true";
            }
            if (parameters.showToolBarHelp === undefined) {
                parameters.showToolBarHelp =  parameters.showToolBar;
            }

            if (parseFloat(item.geogebra_format) >= 5.0) {
                views.is3D = true;
            }

//            var views = {"is3D":false,"AV":false,"SV":false,"CV":false,"EV2":false,"CP":false,"PC":false,"DA":false,"FI":false,"PV":false,"macro":false};

            var previewUrl = (item.previewUrl === undefined) ? tubeurl+"/files/material-"+item.id+".png" : item.previewUrl;
            applet.setPreviewImage(previewUrl, tubeurl+"/images/GeoGebra_loading.png", tubeurl+"/images/applet_play.png");

            successCallback();
        };

        var url = tubeurl+"/api/json.php";
        var xhr = createCORSRequest('POST', url);

        var onError = function() {
            log("Error: The request for fetching material_id " + parameters.material_id + " from tube was not successful.");
        };

        if (!xhr) {
            onError();
            return;
        }

        // Response handlers.
        xhr.onload = success;
        xhr.onerror = onError;
        xhr.onprogress = function(){}; // IE9 will abort the xhr.send without this

        // Send request
        if ( xhr.setRequestHeader ) { // IE9's XDomainRequest does not support this method
            xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
        }
        xhr.send(JSON.stringify(api_request));
    };

    // Create the XHR object.
    function createCORSRequest(method, url) {
        var xhr = new XMLHttpRequest();
        if ("withCredentials" in xhr) {
            // XHR for Chrome/Firefox/Opera/Safari.
            xhr.open(method, url, true);
        } else if (typeof XDomainRequest !== "undefined") {
            // XDomainRequest for IE.
            xhr = new XDomainRequest();
            xhr.open(method, url);
        } else {
            // CORS not supported.
            xhr = null;
        }
        return xhr;
    }


    /**
     * @return NULL if no version found. Else return some things like: '1.6.0_31'
     */
    var JavaVersion = function() {
        var resutl = null;
        // Walk through the full list of mime types.
        for( var i=0,size=navigator.mimeTypes.length; i<size; i++ )
        {
            // The jpi-version is the plug-in version.  This is the best
            // version to use.
            if( (resutl = navigator.mimeTypes[i].type.match(/^application\/x-java-applet;jpi-version=(.*)$/)) !== null ) {
                return resutl[1];
            }
        }
        return null;
    };

    /**
     * @returns boolean Whether the system is capable of showing the GeoGebra HTML5 applet
     */
    applet.isHTML5Installed = function() {
        if (isInternetExplorer()) {
            if ((views.is3D || html5CodebaseScript === "web3d.nocache.js") && getIEVersion() < 11) { // WebGL is supported since IE 11
                return false;
            } else if (getIEVersion() < 10) {
                return false;
            }
        }
        return true;
    };

    /**
     * @returns boolean Whether the system is capable of showing precompiled HTML5 applets
     */
    applet.isCompiledInstalled = function() {
        if (isInternetExplorer()) {
            if (views.is3D && getIEVersion() < 11) { // WebGL is supported since IE 11
                return false;
            } else if (getIEVersion() < 9) {
                return false;
            }
        }
        return true;
    };

    /**
     * @returns The type of the loaded applet or null if no applet was loaded yet.
     */
    applet.getLoadedAppletType = function() {
        return loadedAppletType;
    };

    applet.setPreviewImage = function(previewFilePath, loadingFilePath, playFilePath) {
        previewImagePath = previewFilePath;
        previewLoadingPath = loadingFilePath;
        previewPlayPath = playFilePath;
    };

    applet.removeExistingApplet = function(appletParent, showScreenshot) {
        var i;
        if (typeof appletParent === 'string') {
            appletParent = document.getElementById(appletParent);
        }
        if (loadedAppletType === 'compiled' && window[parameters.id] !== undefined) {
            // Stop/remove the applet
            if (typeof window[parameters.id].stopAnimation === "function") {
                window[parameters.id].stopAnimation();
            }
            if (typeof window[parameters.id].remove === "function") {
                window[parameters.id].remove();
            }

            // Set the applet objects to undefined
            if (ggbApplets !== undefined) {
                for (i=0; i<ggbApplets.length;i++) {
                    if (ggbApplets[i] === window[parameters.id]) {
                        ggbApplets.splice(i, 1);
                    }
                }
            }
            window[parameters.id] = undefined;
        }

        loadedAppletType = null;
        for (i=0; i<appletParent.childNodes.length;i++) {
            var tag = appletParent.childNodes[i].tagName;
            if (appletParent.childNodes[i].className === "applet_screenshot") {
                if (showScreenshot) {
                    // Show the screenshot instead of the removed applet
                    appletParent.childNodes[i].style.display = "block";
                    loadedAppletType = "screenshot";
                } else {
                    // Hide the screenshot
                    appletParent.childNodes[i].style.display = "none";
                }
            } else if (tag === "APPLET" || tag === "ARTICLE" || tag === "DIV" || (loadedAppletType === 'compiled' && (tag === "SCRIPT" || tag === "STYLE"))) {
                // Remove the applet
                appletParent.removeChild(appletParent.childNodes[i]);
                i--;
            }
        }

        var appName = (parameters.id !== undefined ? parameters.id : "ggbApplet");
        var app = window[appName];
        if (app) {
            if (typeof app === "object" && typeof app.getBase64 === "function") { // Check if the variable is a GeoGebra Applet and remove it
                app.remove();
                window[appName] = null;
            }
        }
    };

    applet.refreshHitPoints = function() {
        if (parseVersion(ggbHTML5LoadedCodebaseVersion) >= 5.0) {
            return true; // Not necessary anymore in 5.0
        }
        var app = applet.getAppletObject();
        if (app) {
            if (typeof app.recalculateEnvironments === "function") {
                app.recalculateEnvironments();
                return true;
            }
        }
        return false;
    };

    applet.startAnimation = function() {
        var app = applet.getAppletObject();
        if (app) {
            if (typeof app.startAnimation === "function") {
                app.startAnimation();
                return true;
            }
        }
        return false;
    };

    applet.stopAnimation = function() {
        var app = applet.getAppletObject();
        if (app) {
            if (typeof app.stopAnimation === "function") {
                app.stopAnimation();
                return true;
            }
        }
        return false;
    };

    applet.setPreCompiledScriptPath = function(path, version) {
        preCompiledScriptPath = path;
        if (preCompiledResourcePath === null) {
            preCompiledResourcePath = preCompiledScriptPath;
        }
        preCompiledScriptVersion = version;
    };

    applet.setPreCompiledResourcePath = function(path) {
        preCompiledResourcePath = path;
    };

    applet.getAppletObject = function() {
        var appName = (parameters.id !== undefined ? parameters.id : "ggbApplet");
        return window[appName];
    };

    applet.resize = function() {};

    var injectJavaApplet = function(appletElem, parameters) {
        var applet = document.createElement("applet");
        applet.setAttribute("name", (parameters.id !== undefined ? parameters.id : "ggbApplet"));
        if (parameters.height !== undefined && parameters.height > 0) {
            applet.setAttribute("height", parameters.height);
        }
        if (parameters.width !== undefined && parameters.width > 0) {
            applet.setAttribute("width", parameters.width);
        }
        applet.setAttribute("code", "dummy");

        appendParam(applet, "jnlp_href", jnlpFilePath);
        if (isOverriddenJavaCodebase) {
            appendParam(applet, "codebase", javaCodebase);
        }

        appendParam(applet, "boxborder", "false");
        appendParam(applet, "centerimage", "true");

        if(ggbVersion === "5.0") {
            appendParam(applet, "java_arguments", "-Xmx1024m -Djnlp.packEnabled=false");
        } else {
            appendParam(applet, "java_arguments", "-Xmx1024m -Djnlp.packEnabled=true");
        }

        // Add dynamic parameters
        for (var key in parameters) {
            if (key !== 'width' && key !== 'height') {
                appendParam(applet, key, parameters[key]);
            }
        }

        appendParam(applet, "framePossible", "false");
        if (! isJavaOffline) {
            appendParam(applet, "image", "http://www.geogebra.org/images/java_loading.gif");
        }
        appendParam(applet, "codebase_lookup", "false");

        if (navigator.appName !== 'Microsoft Internet Explorer' || getIEVersion() > 9) {
            applet.appendChild(document.createTextNode("This is a Java Applet created using GeoGebra from www.geogebra.org - it looks like you don't have Java installed, please go to www.java.com"));
        }

        applet.style.display = "block";
        appletElem.appendChild(applet);

//        setTimeout(validateJavaApplet(appletElem, container_ID),5000);

        log("GeoGebra Java applet injected. Used JNLP file = '"+jnlpFilePath+"'"+(isOverriddenJavaCodebase?" with overridden codebase '"+javaCodebase+"'." : "."), parameters);
    };

    var appendParam = function(applet, name, value) {
        var param = document.createElement("param");
        param.setAttribute("name", name);
        param.setAttribute("value", value);
        applet.appendChild(param);
    };

    var valBoolean = function(value) {
        return (value && value !== "false");
    };

    var injectHTML5Applet = function(appletElem, parameters, noPreview) {
        if (parseVersion(html5CodebaseVersion) <= 4.2) {
            noPreview = true;
        }
        // Decide if the script has to be (re)loaded or renderGGBElement can be used to load the applet
        var loadScript = !isRenderGGBElementEnabled && !scriptLoadStarted;
        // Reload the script when not loaded yet, or  currently the wrong version is loaded
        if ((!isRenderGGBElementEnabled && !scriptLoadStarted) || (ggbHTML5LoadedCodebaseVersion !== html5CodebaseVersion || (ggbHTML5LoadedCodebaseIsWebSimple && !html5CodebaseIsWebSimple))) {
            loadScript = true ;
            isRenderGGBElementEnabled = false;
            scriptLoadStarted = false;
        }

        var article = document.createElement("article");
        var oriWidth = parameters.width;
        var oriHeight = parameters.height;

        // The HTML5 version 4.4 changes the height depending on which bars are shown. So we have to correct it here.
        if (parameters.width !== undefined) {
            if (parseVersion(html5CodebaseVersion) <= 4.4) {
                if (valBoolean(parameters.showToolBar)) {
                    parameters.height -= 7;
                }
                if (valBoolean(parameters.showAlgebraInput)) {
                    parameters.height -= 37;
                }
                if (parameters.width < 605 && valBoolean(parameters.showToolBar)) {
                    parameters.width = 605;
                    oriWidth = 605;
                }
            } else {
                // calculate the minWidth
                var minWidth = 100;
                if (valBoolean(parameters.showToolBar) || valBoolean(parameters.showMenuBar)) {
                    if (parameters.hasOwnProperty("customToolBar")) {
                        parameters.customToolbar = parameters.customToolBar;
                    }
                    minWidth = (valBoolean(parameters.showMenuBar) ? 245 : 155);
                }

                if (oriWidth < minWidth) {
                    parameters.width = minWidth;
                    oriWidth = minWidth;
                }
            }
        }
        article.className = "notranslate"; //we remove geogebraweb here, as we don't want to parse it out of the box.
        article.style.border = 'none';
        article.style.display = 'inline-block';

        for (var key in parameters) {
            if (parameters.hasOwnProperty(key) && key !== "appletOnLoad" && key !== 'scale') {
                article.setAttribute("data-param-"+key, parameters[key]);
            }
        }

        // Resize the applet when the window is resized
        applet.resize = function() {
            GGBAppletUtils.responsiveResize(appletElem, parameters);
        };

        if (typeof jQuery === "function") {
            jQuery(window).resize(function() {
                applet.resize();
            });
        } else {
            var oldOnResize = null;
            if (window.onresize !== undefined && typeof window.onresize === "function") {
                oldOnResize = window.onresize;
            }
            window.onresize = function() {
                applet.resize();
                if (typeof oldOnResize === "function") {
                    oldOnResize();
                }
            };
        }


        // Add the tag for the preview image
        if (!noPreview && parameters.width !== undefined) {
            var previewContainer = createScreenShotDiv(oriWidth, oriHeight, parameters.borderColor, false);

            // This div is needed to have an element with position relative as origin for the absolute positioned image
            var previewPositioner = document.createElement("div");
            previewPositioner.className = "applet_scaler";
            previewPositioner.style.position = "relative";
            previewPositioner.style.display = 'block';
            previewPositioner.style.width = oriWidth+'px';
            previewPositioner.style.height = oriHeight+'px';

            // Prevent GeoGebraWeb from showing the splash
            if (!parameters.hasOwnProperty('showSplash')) {
                article.setAttribute("data-param-showSplash", 'false');
            }

            if (window.GGBT_spinner) {
                window.GGBT_spinner.attachSpinner(previewPositioner, '66%');
            }

            if (parseVersion(html5CodebaseVersion)>=5.0) {

                // Workaround: Remove the preview image when the applet is fully loaded
                if (typeof parameters.appletOnLoad === "function") {
                    var oriAppletOnload = parameters.appletOnLoad;
                }
                parameters.appletOnLoad = function() {
                    var preview = appletElem.querySelector(".ggb_preview");
                    if (preview) {
                        preview.parentNode.removeChild(preview);
                    }
                    if (window.GGBT_spinner) {
                        window.GGBT_spinner.removeSpinner(previewPositioner);
                    }
                    if (typeof oriAppletOnload === "function") {
                        oriAppletOnload();
                    }
                };
                previewPositioner.appendChild(previewContainer);
            } else {
                article.appendChild(previewContainer);
            }

            previewPositioner.appendChild(article);
            appletElem.appendChild(previewPositioner);

            // Redo resizing when screenshot is loaded to recalculate it after scrollbars are gone
            setTimeout(function() {
                applet.resize();
            }, 1);
        } else {
            var appletScaler = document.createElement("div");
            appletScaler.className = "applet_scaler";
            appletScaler.style.position = "relative";
            appletScaler.style.display = 'block';

            appletScaler.appendChild(article);
            appletElem.appendChild(appletScaler);

            // Apply scaling
            applet.resize();
        }


        function renderGGBElementWithParams(article, parameters) {
            if (parameters && typeof parameters.appletOnLoad === "function" && typeof renderGGBElement === "function") {
                renderGGBElement(article, parameters.appletOnLoad);
            } else {
                renderGGBElement(article);
            }

            log("GeoGebra HTML5 applet injected and rendered with previously loaded codebase.", parameters);
        }


        function renderGGBElementOnTube(a, parameters) {
            if (typeof renderGGBElement === "undefined") {
                //it is possible, that we get here many times, before script are loaded. So best here to save the article element for later - otherwise only last article processed :-)
                if (html5AppletsToProcess === null) {
                    html5AppletsToProcess = [];
                }
                html5AppletsToProcess.push({
                    article : a,
                    params : parameters
                });
                window.renderGGBElementReady = function() {
                    isRenderGGBElementEnabled = true;
                    if (html5AppletsToProcess !== null && html5AppletsToProcess.length) {
                        html5AppletsToProcess.forEach(function(obj) {
                            renderGGBElementWithParams(obj.article, obj.params);
                        });
                        html5AppletsToProcess = null;
                    }

                };

                //TODO: remove this hack, because it is a hack!
                if (parseVersion(html5CodebaseVersion) < 5.0) {
                        a.className += " geogebraweb";
                }

            } else {
                renderGGBElementWithParams(a, parameters);
            }
        }

        // Load the web script
        if (loadScript) {
            scriptLoadStarted = true;
            if (parseVersion(html5CodebaseVersion)>=4.4) {
                var f_c_u;
                if (fonts_css_url === null) {
                    f_c_u = html5Codebase+"css/fonts.css";
                } else {
                    f_c_u = fonts_css_url;
                }

                var fontscript1 = document.createElement("script");
                fontscript1.type = 'text/javascript';
                fontscript1.innerHTML = '\n' +
                    '//<![CDATA[\n' +
                    'WebFontConfig = {\n' +
                    '   loading: function() {},\n' +
                    '   active: function() {},\n' +
                    '   inactive: function() {},\n' +
                    '   fontloading: function(familyName, fvd) {},\n' +
                    '   fontactive: function(familyName, fvd) {},\n' +
                    '   fontinactive: function(familyName, fvd) {},\n' +
                    '   custom: {\n' +
                    '       families: ["geogebra-sans-serif", "geogebra-serif"],\n' +
                    '           urls: [ "'+f_c_u+'" ]\n' +
                    '   }\n' +
                    '};\n' +
                    '//]]>\n' +
                    '\n';

                var fontscript2 = document.createElement("script");
                fontscript2.type = 'text/javascript';
                fontscript2.src = html5Codebase+'js/webfont.js';

                appletElem.appendChild(fontscript1);
                appletElem.appendChild(fontscript2);
            }

            // Remove all table tags within an article tag if there are any
            for (var i=0; i<article.childNodes.length;i++) {
                var tag = article.childNodes[i].tagName;
                if (tag === "TABLE") {
                    article.removeChild(article.childNodes[i]);
                    i--;
                }
            }

            // Remove old script tags
            if (ggbHTML5LoadedScript !== null) {
                var el = document.querySelector('script[src="'+ggbHTML5LoadedScript+'"]');
                if (el !== undefined) {
                    el.parentNode.removeChild(el);
                }
            }

            var script = document.createElement("script");

            var scriptLoaded = function() {
                renderGGBElementOnTube(article, parameters);
            };

            log(html5Codebase);

            script.src=html5Codebase + html5CodebaseScript;
            script.onload = scriptLoaded;
            ggbHTML5LoadedCodebaseIsWebSimple = html5CodebaseIsWebSimple;
            ggbHTML5LoadedCodebaseVersion = html5CodebaseVersion;
            ggbHTML5LoadedScript = script.src;
            log("GeoGebra HTML5 codebase loaded: '"+html5Codebase+"'.", parameters);
            appletElem.appendChild(script);
        } else {
            renderGGBElementOnTube(article, parameters);
        }

        parameters.height = oriHeight;
        parameters.width = oriWidth;
    };

    var injectCompiledApplet = function(appletElem, parameters, noPreview) {
        var appletObjectName = parameters.id;
        //if (scale !== 1) {
        //    parameters.scale = scale;
        //    appletElem.style.minWidth = parameters.width * scale+"px";
        //    appletElem.style.minHeight = parameters.height * scale+"px";
        //}

        var viewContainer = document.createElement("div");
        viewContainer.id = "view-container-"+appletObjectName;
        viewContainer.setAttribute("width", parameters.width);
        viewContainer.setAttribute("height", parameters.height);
        viewContainer.style.width = parameters.width+"px";
        viewContainer.style.height = parameters.height+"px";
//        viewContainer.style.border = "1px solid black";

        if (parameters.showSplash === undefined) {
            parameters.showSplash = true;
        }

        // Resize the applet when the window is resized
        var oldOnResize = null;
        if (window.onresize !== undefined && typeof window.onresize === "function") {
            oldOnResize = window.onresize;
        }
        window.onresize = function() {
            var scale = GGBAppletUtils.getScale(parameters, appletElem);
            var scaleElem = null;
            for (var i=0; i<appletElem.childNodes.length;i++) {
                if (appletElem.childNodes[i].className === "applet_scaler") {
                    scaleElem = appletElem.childNodes[i];
                    break;
                }
            }

            if (scaleElem !== null) {
                scaleElem.style.transformOrigin = "0% 0% 0px";
                scaleElem.parentNode.style.transform = "";
                if (!isNaN(scale) && scale !== 1) {
                    // Set the scale factor for the applet
                    scaleElem.style.transform = "scale(" + scale + "," + scale + ")";
                    scaleElem.parentNode.style.width = ((parameters.width+2)*scale)+'px';
                    scaleElem.parentNode.style.height = ((parameters.height+2)*scale)+'px';

                } else {
                    // Remove scaling
                    scaleElem.style.transform = "none";
                    scaleElem.parentNode.style.width = (parameters.width+2)+'px';
                    scaleElem.parentNode.style.height = (parameters.height+2)+'px';
                }
            }

            var appName = (parameters.id !== undefined ? parameters.id : "ggbApplet");
            var app = window[appName];
            if (app !== undefined && app !== null && typeof app.recalculateEnvironments === "function") {
                app.recalculateEnvironments();
            }

            if (oldOnResize !== null) {
                oldOnResize();
            }
        };


        var viewImages = document.createElement("div");
        viewImages.id = '__ggb__images';

        // Add the tag for the preview image
        var appletScaler;
        if (!noPreview && previewImagePath !== null && parseVersion(html5CodebaseVersion)>=4.4 && parameters.width !== undefined) {
            var previewContainer = createScreenShotDiv(parameters.width, parameters.height, parameters.borderColor, false);

            // This div is needed to have an element with position relative as origin for the absolute positioned image
            var previewPositioner = document.createElement("div");
            previewPositioner.style.position = "relative";
            previewPositioner.className = "applet_scaler";
            previewPositioner.style.display = 'block';
            previewPositioner.style.width = parameters.width+'px';
            previewPositioner.style.height = parameters.height+'px';
            previewPositioner.appendChild(previewContainer);
            appletElem.appendChild(previewPositioner);
            appletScaler = previewPositioner;

            // Redo resizing when screenshot is loaded to recalculate it after scrollbars are gone
            setTimeout(function() {
                window.onresize();
            }, 1);

            if (typeof window.GGBT_ws_header_footer === "object") {
                window.GGBT_ws_header_footer.setWsScrollerHeight();
            }
        } else {
            appletScaler = document.createElement("div");
            appletScaler.className = "applet_scaler";
            appletScaler.style.position = "relative";
            appletScaler.style.display = 'block';

            appletElem.appendChild(appletScaler);
            window.onresize();
        }

        // Load the web fonts
        if (!ggbCompiledResourcesLoadFinished && !ggbCompiledResourcesLoadInProgress) {
//            var resource1 = document.createElement("link");
//            resource1.type = 'text/css';
//            resource1.rel = 'stylesheet';
//            resource1.href = preCompiledResourcePath+'/mathquillggb.css';
//
//            var resource2 = document.createElement("script");
//            resource2.type = 'text/javascript';
//            resource2.src = preCompiledResourcePath+'/jquery-1.7.2.min.js';
//
//            var resource3 = document.createElement("script");
//            resource3.type = 'text/javascript';
//            resource3.src = preCompiledResourcePath+'/mathquillggb.js';

            var resource4 = document.createElement("script");
            resource4.type = 'text/javascript';
            resource4.innerHTML = '\n' +
                'WebFontConfig = {\n' +
                '   loading: function() {},\n' +
                '   active: function() {},\n' +
                '   inactive: function() {},\n' +
                '   fontloading: function(familyName, fvd) {},\n' +
                '   fontactive: function(familyName, fvd) {' +
                '       if (!ggbCompiledAppletsLoaded) {' +
                '           ggbCompiledAppletsLoaded = true;' +
                '           ' +
                '           setTimeout(function() {' +
                '               ggbCompiledResourcesLoadFinished = true;' +
                '               ggbCompiledResourcesLoadInProgress = false;' +
                '               if (window.ggbApplets != undefined) {' +
                '                   for (var i = 0 ; i < window.ggbApplets.length ; i++) {' +
                '                       window.ggbApplets[i].init({scale:window.ggbApplets[i].scaleParameter, url:window.ggbApplets[i].preCompiledScriptPath+"/", ss:'+(parameters.showSplash?'true':'false')+', sdz:'+(parameters.enableShiftDragZoom?'true':'false')+', rc:'+(parameters.enableRightClick?'true':'false')+', sri:'+(parameters.showResetIcon?'true':'false')+'});' +
                '                   }' +
                '               }' +
                '               if (typeof window.ggbCompiledAppletsOnLoad == "function") {' +
                '                   window.ggbCompiledAppletsOnLoad();' +
                '               }' +
                '           },1);' +
                '       }' +
                '   },\n' +
                '   fontinactive: function(familyName, fvd) {},\n' +
                '   custom: {\n' +
                '       families: ["geogebra-sans-serif", "geogebra-serif"],\n' +
                '           urls: [ "'+preCompiledResourcePath+"/fonts/fonts.css"+'" ]\n' +
                '   }\n' +
                '};\n' +
                '\n';

            var resource5 = document.createElement("script");
            resource5.type = 'text/javascript';
            resource5.src = preCompiledResourcePath+'/fonts/webfont.js';

            ggbCompiledResourcesLoadInProgress = true;
//            appletScaler.appendChild(resource1);
//            appletScaler.appendChild(resource2);
//            appletScaler.appendChild(resource3);
            appletScaler.appendChild(resource4);
            appletScaler.appendChild(resource5);
        }

        // Load the applet script
        var appletStyle = document.createElement("style");
        appletStyle.innerHTML = '\n' +
            '.view-frame {\n' +
            '    border: 1px solid black;\n' +
            '    display: inline-block;\n' +
            '}\n' +
            '#tip {\n' +
            '    background-color: yellow;\n' +
            '    border: 1px solid blue;\n' +
            '    position: absolute;\n' +
            '    left: -200px;\n' +
            '    top: 100px;\n' +
            '};\n';

        appletScaler.appendChild(appletStyle);

        var script = document.createElement("script");

        var scriptLoaded = function() {
            window[appletObjectName].preCompiledScriptPath = preCompiledScriptPath;
            window[appletObjectName].scaleParameter = parameters.scale;

            if (!noPreview) {
                appletScaler.querySelector(".ggb_preview").remove();
            }
            appletScaler.appendChild(viewContainer);
            appletScaler.appendChild(viewImages);

            if (ggbCompiledResourcesLoadFinished) {
                window[appletObjectName].init({scale:parameters.scale, url:preCompiledScriptPath+'/', ss:parameters.showSplash, sdz:parameters.enableShiftDragZoom, rc:parameters.enableRightClick, sri:parameters.showResetIcon});
                if (typeof window.ggbAppletOnLoad === 'function') {
                    window.ggbAppletOnLoad(appletElem.id);
                }
                if (typeof parameters.appletOnLoad === 'function') {
                    parameters.appletOnLoad(appletElem.id);
                }

            }
        };

        var scriptFile = preCompiledScriptPath + "/applet.js" + (preCompiledScriptVersion !== null && preCompiledScriptVersion !== null ? "?v="+preCompiledScriptVersion : "");
        script.src=scriptFile;
        script.onload = scriptLoaded;

        log("GeoGebra precompiled applet injected. Script="+scriptFile+".");
        appletScaler.appendChild(script);
    };

    var injectScreenshot = function(appletElem, parameters, showPlayButton) {
        // Add the tag for the preview image
        var previewContainer = createScreenShotDiv(parameters.width, parameters.height, parameters.borderColor, showPlayButton);

        // This div is needed to have an element with position relative as origin for the absolute positioned image
        var previewPositioner = document.createElement("div");
        previewPositioner.style.position = "relative";
        previewPositioner.style.display = 'block';
        previewPositioner.style.width = parameters.width+'px';
        previewPositioner.style.height = parameters.height+'px';
        previewPositioner.className = "applet_screenshot applet_scaler" + (showPlayButton ? " applet_screenshot_play" : "");
        previewPositioner.appendChild(previewContainer);

        var scale = GGBAppletUtils.getScale(parameters, appletElem, showPlayButton);


        if(showPlayButton) {
            appletElem.appendChild(getPlayButton());
            if (!window.GGBT_wsf_view) {
                appletElem.style.position = "relative";
            }
        } else if (window.GGBT_spinner) {
            window.GGBT_spinner.attachSpinner(previewPositioner, '66%');
        }

        appletElem.appendChild(previewPositioner);

        // Set the scale for the preview image
        if (scale !== 1 && !isNaN(scale)) {
            // Set the scale factor for the preview image
            previewPositioner.style.transform = "scale(" + scale + "," + scale + ")";
            previewPositioner.style.transformOrigin = "0% 0% 0px";
            previewPositioner.style.width = (parameters.width)+'px';
            previewPositioner.style.height = (parameters.height)+'px';
            previewPositioner.parentNode.style.width = (parameters.width*scale)+'px';
            previewPositioner.parentNode.style.height = (parameters.height*scale)+'px';
        }

        applet.resize = function() {
            resizeScreenshot(appletElem, previewContainer, previewPositioner, showPlayButton);
        };

        if (typeof jQuery === "function") {
            jQuery(window).resize(function() {
                applet.resize();
            });
        } else {
            var oldOnResize = null;
            // Resize the preview when the window is resized
            if (window.onresize !== undefined && typeof window.onresize === "function") {
                oldOnResize = window.onresize;
            }
            window.onresize = function() {
                applet.resize();
                if (typeof oldOnResize === "function") {
                    oldOnResize();
                }
            };
        }
        applet.resize();
    };

    function resizeScreenshot(appletElem, previewContainer, previewPositioner, showPlayButton, oldOnResize) {
        if (!appletElem.contains(previewContainer)) { // Don't resize the screenshot if it is not visible (anymore)
            return;
        }

        if (typeof window.GGBT_wsf_view === "object" && window.GGBT_wsf_view.isFullscreen()) {
            if (appletElem.id !== "fullscreencontent") {
                return;
            }
            window.GGBT_wsf_view.setCloseBtnPosition(appletElem);
        }

        var scale = GGBAppletUtils.getScale(parameters, appletElem, showPlayButton);

        if (previewPositioner.parentNode !== null) {
            if (!isNaN(scale) && scale !== 1) {
                previewPositioner.style.transform = "scale(" + scale + "," + scale + ")";
                previewPositioner.style.transformOrigin = "0% 0% 0px";
                previewPositioner.parentNode.style.width = (parameters.width * scale) + 'px';
                previewPositioner.parentNode.style.height = (parameters.height * scale) + 'px';
            } else {
                previewPositioner.style.transform = "none";
                previewPositioner.parentNode.style.width = (parameters.width) + 'px';
                previewPositioner.parentNode.style.height = (parameters.height) + 'px';
            }
        }

        // positions the applet in the center of the popup
        if(typeof window.GGBT_wsf_view === 'object' && window.GGBT_wsf_view.isFullscreen()) {
            GGBAppletUtils.positionCenter(appletElem);
        }

        if (typeof window.GGBT_ws_header_footer === "object") {
            window.GGBT_ws_header_footer.setWsScrollerHeight();
        }

        if (typeof oldOnResize === "function") {
            oldOnResize();
        }

    }

    applet.onExitFullscreen = function(fullscreenContainer, appletElem) {
        appletElem.appendChild(fullscreenContainer);
    };

    var injectPlayButton = function(appletElem, parameters, noPreview, type) {
        injectScreenshot (appletElem, parameters, true);

        // Load applet on play button click
        var play = function() {
            // Remove the screenshot after the applet is injected
            var elems = [];
            for (i=0; i<appletElem.childNodes.length;i++) {
                elems.push(appletElem.childNodes[i]);
            }
            if (type === "java") {
                loadedAppletType = type;
                injectJavaApplet(appletElem, parameters);
            } else {
                if (window.GGBT_wsf_view) {
                    var content = window.GGBT_wsf_view.renderFullScreen(appletElem, parameters.id);
                    var container = document.getElementById("fullscreencontainer");
                    var oldcontent = jQuery(appletElem).find('.fullscreencontent');
                    if (oldcontent.length > 0) {
                        // Reuse the previously rendered applet
                        content.remove();
                        oldcontent.attr("id", "fullscreencontent").show();
                        jQuery(container).append(oldcontent);
                        window.onresize();
                    } else {
                        // Render a new applet
                        injectHTML5Applet(content, parameters, false);
                    }
                    window.GGBT_wsf_view.launchFullScreen(container);
                } else {
                    loadedAppletType = type;
                    injectHTML5Applet(appletElem, parameters, false);
                }
            }

            if (!window.GGBT_wsf_view) {
                for (i = 0; i < elems.length; i++) {
                    appletElem.removeChild(elems[i]);
                }
            }
        };

        // Find the play button and add the click handler
        var imgs = appletElem.getElementsByClassName("ggb_preview_play");
        for (var i = 0; i < imgs.length; i++) {
            imgs[i].addEventListener('click', play, false);
            imgs[i].addEventListener('ontouchstart', play, false);
        }

        // Call onload
        if (typeof window.ggbAppletPlayerOnload === 'function') {
            window.ggbAppletPlayerOnload(appletElem);
        }

        //remove fullscreen button if not needed
        if (isMobileDevice() && window.GGBT_wsf_view) {
            $(".wsf-element-fullscreen-button").remove();
        }
    };

    var getPlayButton = function() {
        var playButtonContainer = document.createElement("div");
        playButtonContainer.className = 'ggb_preview_play icon-applet-play';
        if (!window.GGBT_wsf_view) { // on tube, the play button image is defined in a css file
            var css = '' +
                '.icon-applet-play {' +
                '   width: 100%;' +
                '   height: 100%;box-sizing: border-box;position: absolute;z-index: 1001;cursor: pointer;border-width: 0px;' +
                '   background-color: transparent;background-repeat: no-repeat;left: 0;top: 0;background-position: center center;' +
                '   background-image: url("'+getTubeURL()+'/images/worksheet/icon-start-applet.png");' +
                '}' +
                '.icon-applet-play:hover {' +
                        'background-image: url("'+getTubeURL()+'/images/worksheet/icon-start-applet-hover.png");' +
                '}';
            var style = document.createElement('style');

            if (style.styleSheet) {
                style.styleSheet.cssText = css;
            } else {
                style.appendChild(document.createTextNode(css));
            }

            document.getElementsByTagName('head')[0].appendChild(style);
        }
        return playButtonContainer;
    };

    var createScreenShotDiv = function(oriWidth, oriHeight, borderColor, showPlayButton) {
        var previewContainer = document.createElement("div");
        previewContainer.className = "ggb_preview";
        previewContainer.style.position = "absolute";
        //previewContainer.style.zIndex = "1000001";
        // too high z-index causes various problems
        // overlaps fixed header
        // overlaps popups
        previewContainer.style.zIndex = "90";
        previewContainer.style.width = oriWidth-2+'px'; // Remove 2 pixel for the border
        previewContainer.style.height = oriHeight-2+'px'; // Remove 2 pixel for the border
        previewContainer.style.top = "0px";
        previewContainer.style.left = "0px";
        previewContainer.style.overflow = "hidden";
        previewContainer.style.backgroundColor = "white";
        var bc = 'lightgrey';
        if (borderColor !== undefined) {
            if (borderColor === "none") {
                bc = "transparent";
            } else {
                bc = borderColor;
            }
        }
        previewContainer.style.border = "1px solid " + bc;

        var preview = document.createElement("img");
        preview.style.position = "relative";
        preview.style.zIndex = "1000";
        preview.style.top = "-1px"; // Move up/left to hide the border on the image
        preview.style.left = "-1px";
        if (previewImagePath !== null) {
            preview.setAttribute("src", previewImagePath);
        }
        preview.style.opacity = 0.7;

        if (previewLoadingPath !== null) {

            var previewOverlay;

            var pWidth, pHeight;
            if (!showPlayButton) {
                previewOverlay = document.createElement("img");
                previewOverlay.style.position = "absolute";
                previewOverlay.style.zIndex = "1001";
                previewOverlay.style.opacity = 1.0;

                preview.style.opacity = 0.3;

                pWidth = 360;
                if (pWidth > (oriWidth/4*3)) {
                    pWidth = oriWidth/4*3;
                }
                pHeight = pWidth/5.8;
                previewOverlay.setAttribute("src", previewLoadingPath);

                previewOverlay.setAttribute("width", pWidth);
                previewOverlay.setAttribute("height", pHeight);
                var pX = (oriWidth - pWidth) / 2;
                var pY = (oriHeight - pHeight) / 2;
                previewOverlay.style.left = pX + "px";
                previewOverlay.style.top = pY + "px";

                previewContainer.appendChild(previewOverlay);
            }
        }

        previewContainer.appendChild(preview);
        return previewContainer;
    };


    var buildJNLPFileName = function(isOffline) {
        var version = parseFloat(javaCodebaseVersion);
        var filename = "applet" + version*10 + "_";
        if (isOffline) {
            filename += "local";
        } else {
            filename += "web";
        }
        if (views.is3D) {
            filename += "_3D";
        }
        filename += ".jnlp";
        return filename;
    };


    /**
     * Detects the type of the applet (java or html5).
     * If a fixed type is passed in preferredType (java or html5), this type is forced.
     * Otherwise the method tries to find out which types are supported by the system.
     * If a preferredType is passed, this type is used if it is supported.
     * If auto is passed, the preferred type is html5 for versions >= 4.4 and java for all versions < 4.4.
     * @param preferredType can be 'preferJava', 'preferHTML5', 'java', 'html5', 'auto' or 'screenshot'. Default='auto'
     */
    var detectAppletType = function(preferredType) {
        preferredType = preferredType.toLowerCase();
        if ((preferredType === "java") || (preferredType === "html5") || (preferredType === "screenshot") || (preferredType === "compiled")) {
            return preferredType;
        }

        if (preferredType === "preferjava") {
            if (applet.isJavaInstalled()) {
                return "java";
            } else {
                return "html5";
            }
        } else if (preferredType === "preferhtml5") {
            if (applet.isHTML5Installed()) {
                return "html5";
            } else {
                return "java";
            }
        } else if ((preferredType === "prefercompiled") && (preCompiledScriptPath !== null)) {
            if (applet.isCompiledInstalled()) {
                return "compiled";
            } else {
                return "java";
            }
        } else {
            // type=auto
            if ((applet.isJavaInstalled()) &&
                (!applet.isHTML5Installed())) {
                return "java";
            } else {
                return "html5";
            }
        }
    };

    var getIEVersion = function() {
        var a=navigator.appVersion;
        if (a.indexOf("Trident/7.0") > 0) {
            return 11;
        } else {
            return a.indexOf('MSIE')+1?parseFloat(a.split('MSIE')[1]):999;
        }
    };

    var isInternetExplorer = function() {
        return (getIEVersion() !== 999);
    };


    var modules = ["web", "webSimple", "web3d", "tablet", "tablet3d", "phone"];
    /**
     * @param version Can be: 3.2, 4.0, 4.2, 4.4, 5.0, test, test42, test44, test50
     */
    var setDefaultHTML5CodebaseForVersion = function(version, offline) {
        html5CodebaseVersion = version;
        if (offline) {
            setHTML5CodebaseInternal(html5CodebaseVersion, true);
            return;
        }

        // Set the codebase URL for the version
        var hasWebSimple = ! html5NoWebSimple;
        if (hasWebSimple) {
            var v = parseVersion(html5CodebaseVersion);
            if ((!isNaN(v) && v < 4.4)) {
                hasWebSimple = false;
            }
        }

        var protocol,
            codebase;
        if (window.location.protocol.substr(0,4) === 'http') {
            protocol = window.location.protocol;
        } else {
            protocol = 'http:';
        }
        var index = html5CodebaseVersion.indexOf("//");
        if (index > 0) {
            codebase = html5CodebaseVersion;            
        } else if(index === 0) {
            codebase = protocol + html5CodebaseVersion;
        } else {
            codebase = "https://cdn.geogebra.org/"+latestVersion+"/";
        }
        
        for(var key in modules){
            if (html5CodebaseVersion.slice(modules[key].length*-1) === modules[key] ||
                html5CodebaseVersion.slice((modules[key].length+1)*-1) === modules[key]+"/") {
                setHTML5CodebaseInternal(codebase, false);
                return;
            }
        }

        // Decide if web, websimple or web3d should be used
        if (!GGBAppletUtils.isFlexibleWorksheetEditor() && hasWebSimple && !views.is3D && !views.AV && !views.SV && !views.CV && !views.EV2 && !views.CP && !views.PC && !views.DA && !views.FI && !views.PV &&
            !valBoolean(parameters.showToolBar) && !valBoolean(parameters.showMenuBar) && !valBoolean(parameters.showAlgebraInput) && !valBoolean(parameters.enableRightClick)) {
            codebase += 'webSimple/';
        } else {
            codebase += 'web3d/';
        }

        setHTML5CodebaseInternal(codebase, false);
    };

    var setHTML5CodebaseInternal = function(codebase, offline) {
        if (codebase.slice(-1) !== '/') {
            codebase += '/';
        }
        html5Codebase = codebase;

        if (offline === null) {
            offline = (codebase.indexOf("http") === -1);
        }
        isHTML5Offline = offline;

        // Set the scriptname (web or webSimple)
        html5CodebaseScript = "web.nocache.js";
        html5CodebaseIsWebSimple = false;
        var folders = html5Codebase.split("/");
        if (folders.length > 1) {
            if (! offline && folders[folders.length-2] === 'webSimple') {  // Currently we don't use webSimple for offline worksheets
                html5CodebaseScript = "webSimple.nocache.js";
                html5CodebaseIsWebSimple = true;
            } else if (modules.indexOf(folders[folders.length-2]) >= 0) {
                html5CodebaseScript = folders[folders.length-2] + ".nocache.js";
            }
        }

        // Extract the version from the codebase folder
        folders = codebase.split('/');
        html5CodebaseVersion = folders[folders.length-3];
        if (html5CodebaseVersion.substr(0,4) === 'test') {
            html5CodebaseVersion = html5CodebaseVersion.substr(4,1) + '.' + html5CodebaseVersion.substr(5,1);
        } else if (html5CodebaseVersion.substr(0,3) === 'war' || html5CodebaseVersion.substr(0,4) === 'beta') {
            html5CodebaseVersion = '5.0';
        }
    };

    var setDefaultJavaCodebaseForVersion = function(version) {

        // There are no test versions for java. So when test is passed, it will be converted to the normal codebase
        if (version === "test32") {
            javaCodebaseVersion = "3.2";
        } else if (version === "test40") {
            javaCodebaseVersion = "4.0";
        } else if (version === "test42") {
            javaCodebaseVersion = "4.2";
        } else if (version === "test50") {
            javaCodebaseVersion = "5.0";
        } else if (version === "test") {
            javaCodebaseVersion = ggbVersion;
        } else {
            javaCodebaseVersion = version;
        }

        // For versions below 4.0 the java codebase of version 4.0 is used.
        if (parseVersion(javaCodebaseVersion)<4.0) {
            javaCodebaseVersion = "4.0";
        }

        var protocol;
        if (window.location.protocol.substr(0,4) === 'http') {
            protocol = window.location.protocol;
        } else {
            protocol = 'http:';
        }
        var codebase = protocol+"//jars.geogebra.org/webstart/" + javaCodebaseVersion + '/';
        if (javaCodebaseVersion === '4.0' || javaCodebaseVersion === '4.2') {
            codebase += 'jnlp/';
        }

        applet.setJNLPBaseDir('https://www.geogebra.org/webstart/');

        doSetJavaCodebase(codebase, false);
    };

    var log = function(text, parameters) {
        if ( window.console && window.console.log ) {
            if(!parameters || (typeof parameters.showLogging === 'undefined') ||
                (parameters.showLogging && parameters.showLogging !== "false")) {
                    console.log(text);
            }
        }
    };

    // Read the material parameters from the tube API, if a material_id was passed
    if (parameters.material_id !== undefined) {
        fetchParametersFromTube(continueInit);
    } else {
        continueInit();
    }

    function continueInit() {
        var html5Version = ggbVersion;
        if (html5OverwrittenCodebaseVersion !== null) {
            html5Version = html5OverwrittenCodebaseVersion;
        } else {
            if (parseFloat(html5Version) < 5.0) { // Use 5.0 as default for html5. Change the version number here, when a new stable version is released.
                html5Version = "5.0";
            }
        }

        // Initialize the codebase with the default URLs
        setDefaultHTML5CodebaseForVersion(html5Version, false);
        setDefaultJavaCodebaseForVersion(ggbVersion); // For java we always use the version of the file per default.

        if (html5OverwrittenCodebase !== null) {
            setHTML5CodebaseInternal(html5OverwrittenCodebase, isHTML5Offline);
        }
        initComplete = true;
    }

    return applet;
};

var GGBAppletUtils = (function() {
    "use strict";

    function isFlexibleWorksheetEditor() {
        return (window.GGBT_wsf_edit !== undefined);
    }

    function getWidthHeight(appletElem, appletWidth, allowUpscale, noBorder) {
        // Find the container class
        var container = null;

        var myWidth = 0, myHeight = 0, windowWidth = 0, border = 0, borderRight = 0, borderLeft = 0, borderTop = 0;

        if (container) {
            myWidth = container.offsetWidth;
            myHeight = container.offsetWidth;
        } else {
            if (window.innerWidth && document.documentElement.clientWidth) {
                myWidth = Math.min(window.innerWidth, document.documentElement.clientWidth);
                myHeight = Math.min(window.innerHeight, document.documentElement.clientHeight);
                // Using mywith instead of innerWidth because after rotating a mobile device the innerWidth is sometimes wrong (e.g. on Galaxy Note III)
                // windowWidth = window.innerWidth
                windowWidth = myWidth;
            } else if (typeof( window.innerWidth ) === 'number') {
                //Non-IE
                myWidth = window.innerWidth;
                myHeight = window.innerHeight;
                windowWidth = window.innerWidth;
            } else if (document.documentElement && ( document.documentElement.clientWidth || document.documentElement.clientHeight )) {
                //IE 6+ in 'standards compliant mode'
                myWidth = document.documentElement.clientWidth;
                myHeight = document.documentElement.clientHeight;
                windowWidth = document.documentElement.clientWidth;
            } else if (document.body && ( document.body.clientWidth || document.body.clientHeight )) {
                //IE 4 compatible
                myWidth = document.body.clientWidth;
                myHeight = document.body.clientHeight;
                windowWidth = document.documentElement.clientWidth;
            }

            if (appletElem) {
                var rect = appletElem.getBoundingClientRect();
                if (rect.left > 0) {
                    if (rect.left <= myWidth && (noBorder === undefined || !noBorder)) {
                        if (document.dir === 'rtl') {
                            borderRight = myWidth - rect.width - rect.left;
                            borderLeft = (windowWidth <= 480 ? 10 : 30);
                        } else {
                            borderLeft = rect.left;
                            borderRight = (windowWidth <= 480 ? 10 : 30);
                        }
                        border = borderLeft + borderRight;
                    }
                }
            }

            // overwrite borders with other numbers if it is in fullscreen mode
            // make sure X is visible all the time
            if(appletElem && typeof window.GGBT_wsf_view === "object" && window.GGBT_wsf_view.isFullscreen()) {
                // APPLET IS DISPLAYED IN FULLSCREEN
                var appletRect = appletElem.getBoundingClientRect();

                // X is positioned to the right/left
                // set a border so it is visible
                if(window.GGBT_wsf_view.getCloseBtnPosition() === 'closePositionRight') {
                    // X is positioned to the right/left
                    // 40 is the width of the X close button
                    border = 40;
                    borderTop = 0;
                } else if(window.GGBT_wsf_view.getCloseBtnPosition() === 'closePositionTop') {
                    // X is positioned on top
                    border = 0;
                    borderTop = 40;
                }
            }
        }

        //console.log('myWidth: '+ myWidth);
        //console.log('myHeight: ' + myHeight);
        //console.log('border: ' + border);
        //console.log('borderTop: '+ borderTop);

        if (appletElem) {
            if ((allowUpscale === undefined || !allowUpscale) && appletWidth > 0 && appletWidth + border < myWidth) {
                myWidth = appletWidth;
            } else {
                myWidth -= border;
            }

            if(typeof window.GGBT_wsf_view === "object" && window.GGBT_wsf_view.isFullscreen() && (allowUpscale === undefined || !allowUpscale)) {
                // applet is displayed in fullscreen
                myHeight -= borderTop;
            }
        }

        //console.log('myWidth: ' + myWidth + ', myHeight: ' + myHeight);

        return {width: myWidth, height: myHeight};
    }

    function calcScale(parameters, appletElem, allowUpscale, showPlayButton){
        if (parameters.isScreenshoGenerator) {
            return 1;
        }
        var ignoreHeight = (showPlayButton !== undefined && showPlayButton);
        var windowSize = getWidthHeight(appletElem, parameters.width, allowUpscale, ignoreHeight && window.GGBT_wsf_view);
        var windowWidth = parseInt(windowSize.width);

        var appletWidth = parameters.width;
        var appletHeight = parameters.height;
        if (appletWidth === undefined) {
            var articles = appletElem.getElementsByTagName('article');
            if (articles.length === 1) {
                appletWidth = articles[0].offsetWidth;
                appletHeight = articles[0].offsetHeight;
            }
        }

        var xscale = windowWidth / appletWidth;
        var yscale = (ignoreHeight ? 1 : windowSize.height / appletHeight);
        if (allowUpscale !== undefined && !allowUpscale) {
            xscale = Math.min(1, xscale);
            yscale = Math.min(1, yscale);
        }

        return Math.min(xscale, yscale);
    }

    function getScale(parameters, appletElem, showPlayButton) {
        var scale = 1,
            autoScale,
            allowUpscale = false;

        if (parameters.hasOwnProperty('allowUpscale')) {
            allowUpscale = parameters.allowUpscale;
        }

        if (parameters.hasOwnProperty('scale')) {
            scale = parseFloat(parameters.scale);
            if (isNaN(scale) || scale === null || scale === 0) {
                scale = 1;
            }
            if (scale > 1) {
                allowUpscale = true;
            }
        }

        if(appletElem && typeof window.GGBT_wsf_view === "object" && window.GGBT_wsf_view.isFullscreen()) {
            allowUpscale = true;
        }

        if (!isFlexibleWorksheetEditor() && !(parameters.hasOwnProperty('disableAutoScale') && parameters.disableAutoScale)) {
            autoScale = calcScale(parameters, appletElem, allowUpscale, showPlayButton);
        } else {
            return scale;
        }

        if (allowUpscale && (!parameters.hasOwnProperty('scale') || scale === 1)) {
            return autoScale;
        } else {
            return Math.min(scale, autoScale);
        }
    }

    /**
     * Positiones the applet in the center of the screen
     * Used for fullscreen popups
     * @param appletElem
     */
    function positionCenter(appletElem) {
        var windowWidth = Math.min(window.innerWidth, document.documentElement.clientWidth);
        var windowHeight = Math.min(window.innerHeight, document.documentElement.clientHeight);
        var appletRect = appletElem.getBoundingClientRect();

        var calcHorizontalBorder = (windowWidth - appletRect.width) / 2;
        var calcVerticalBorder = (windowHeight - appletRect.height) / 2;

        if(calcVerticalBorder < 0) {
            calcVerticalBorder = 0;
        }

        appletElem.style.position = "relative";

        if(window.GGBT_wsf_view.getCloseBtnPosition() === 'closePositionRight') {
            // X is positioned to the right/left

            if(calcHorizontalBorder < 40) {
                // if there is not enough space left for the X, don't position it in the center
                appletElem.style.left = '40px';
            } else {
                appletElem.style.left = calcHorizontalBorder + 'px';
            }
            appletElem.style.top = calcVerticalBorder + 'px';

        } else if(window.GGBT_wsf_view.getCloseBtnPosition() === 'closePositionTop') {
            // X is positioned on top

            if(calcVerticalBorder < 40) {
                // if there is not enough space left for the X, don't position it in the center
                appletElem.style.top = '40px';
            } else {
                appletElem.style.top = calcVerticalBorder + 'px';
            }

            appletElem.style.left = calcHorizontalBorder + 'px';
        }
    }

    function responsiveResize(appletElem, parameters) {
        var article = appletElem.getElementsByTagName("article")[0];

        if (article) {
            if (typeof window.GGBT_wsf_view === "object" && window.GGBT_wsf_view.isFullscreen()) {
                var articles = appletElem.getElementsByTagName("article");
                if (articles.length > 0 && parameters.id !== articles[0].getAttribute("data-param-id")) {
                    return;
                }

                window.GGBT_wsf_view.setCloseBtnPosition(appletElem);
            }

            var scale = getScale(parameters, appletElem);

            article.removeAttribute("data-param-scale");
            article.setAttribute("data-scalex", scale);
            article.setAttribute("data-scaley", scale);
            if (isFlexibleWorksheetEditor()) {
                article.setAttribute("data-param-scale", scale);
            }

            var scaleElem = null;
            for (var i = 0; i < appletElem.childNodes.length; i++) {
                if (appletElem.childNodes[i].className === "applet_scaler") {
                    scaleElem = appletElem.childNodes[i];
                    break;
                }
            }

            if (scaleElem !== null) {
                scaleElem.style.transformOrigin = "0% 0% 0px";
                scaleElem.parentNode.style.transform = "";
                if (!isNaN(scale) && scale !== 1) {
                    // Set the scale factor for the applet
                    scaleElem.style.transform = "scale(" + scale + "," + scale + ")";
                    scaleElem.parentNode.style.width = (parameters.width * scale) + 'px';
                    scaleElem.parentNode.style.height = (parameters.height * scale) + 'px';

                } else {
                    // Remove scaling
                    scaleElem.style.transform = "none";
                    scaleElem.parentNode.style.width = (parameters.width) + 'px';
                    scaleElem.parentNode.style.height = (parameters.height) + 'px';
                }
            }

            // positions the applet in the center of the popup
            if (typeof window.GGBT_wsf_view === 'object' && window.GGBT_wsf_view.isFullscreen()) {
                positionCenter(appletElem);
            }

            var appName = (parameters.id !== undefined ? parameters.id : "ggbApplet");
            var app = window[appName];
            if (app !== undefined && app !== null && typeof app.recalculateEnvironments === "function") {
                app.recalculateEnvironments();
            }

            if (window.GGBT_wsf_view && !window.GGBT_wsf_view.isFullscreen()) {
                window.GGBT_wsf_general.adjustContentToResize($(article).parents('.content-added-content'));
            }
        }
    }

    return {
        responsiveResize: responsiveResize,
        isFlexibleWorksheetEditor: isFlexibleWorksheetEditor,
        positionCenter: positionCenter,
        getScale: getScale
    };
})();