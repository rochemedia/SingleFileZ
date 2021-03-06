/*
 * Copyright 2010-2020 Gildas Lormeau
 * contact : gildas.lormeau <at> gmail.com
 * 
 * This file is part of SingleFile.
 *
 *   The code in this file is free software: you can redistribute it and/or 
 *   modify it under the terms of the GNU Affero General Public License 
 *   (GNU AGPL) as published by the Free Software Foundation, either version 3
 *   of the License, or (at your option) any later version.
 * 
 *   The code in this file is distributed in the hope that it will be useful, 
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of 
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero 
 *   General Public License for more details.
 *
 *   As additional permission under GNU AGPL version 3 section 7, you may 
 *   distribute UNMODIFIED VERSIONS OF THIS file without the copy of the GNU 
 *   AGPL normally required by section 4, provided you include this license 
 *   notice and a URL through which recipients can access the Corresponding 
 *   Source.
 */

/* global window, Event */

(() => {

	const LOAD_DEFERRED_IMAGES_START_EVENT = "single-filez-load-deferred-images-start";
	const LOAD_DEFERRED_IMAGES_END_EVENT = "single-filez-load-deferred-images-end";
	const LOAD_DEFERRED_IMAGES_KEEP_ZOOM_LEVEL_START_EVENT = "single-filez-load-deferred-images-keep-zoom-level-start";
	const LOAD_DEFERRED_IMAGES_KEEP_ZOOM_LEVEL_END_EVENT = "single-filez-load-deferred-images-keep-zoom-level-end";
	const LOAD_DEFERRED_IMAGES_RESET_ZOOM_LEVEL_EVENT = "single-filez-load-deferred-images-keep-zoom-level-reset";
	const LOAD_DEFERRED_IMAGES_RESET_EVENT = "single-filez-load-deferred-images-reset";
	const BLOCK_COOKIES_START_EVENT = "single-filez-block-cookies-start";
	const BLOCK_COOKIES_END_EVENT = "single-filez-block-cookies-end";
	const BLOCK_STORAGE_START_EVENT = "single-filez-block-storage-start";
	const BLOCK_STORAGE_END_EVENT = "single-filez-block-storage-end";
	const LAZY_LOAD_ATTRIBUTE = "single-filez-lazy-load";
	const LOAD_IMAGE_EVENT = "single-filez-load-image";
	const IMAGE_LOADED_EVENT = "single-filez-image-loaded";
	const NEW_FONT_FACE_EVENT = "single-filez-new-font-face";
	const FONT_STYLE_PROPERTIES = {
		family: "font-family",
		style: "font-style",
		weight: "font-weight",
		stretch: "font-stretch",
		unicodeRange: "unicode-range",
		variant: "font-variant",
		featureSettings: "font-feature-settings"
	};

	const addEventListener = (type, listener, options) => window.addEventListener(type, listener, options);
	const dispatchEvent = event => window.dispatchEvent(event);
	const CustomEvent = window.CustomEvent;
	const document = window.document;
	const screen = window.screen;
	const Element = window.Element;
	const UIEvent = window.UIEvent;
	const FileReader = window.FileReader;
	const Blob = window.Blob;
	const console = window.console;
	const warn = (console && console.warn && ((...args) => console.warn(...args))) || (() => { });

	const observers = new Map();
	const observedElements = new Map();

	addEventListener(LOAD_DEFERRED_IMAGES_START_EVENT, () => loadDeferredImagesStart());
	addEventListener(LOAD_DEFERRED_IMAGES_KEEP_ZOOM_LEVEL_START_EVENT, () => loadDeferredImagesStart(true));

	function loadDeferredImagesStart(keepZoomLevel) {
		const scrollingElement = document.scrollingElement || document.documentElement;
		const clientHeight = scrollingElement.clientHeight;
		const clientWidth = scrollingElement.clientWidth;
		const scrollHeight = Math.max(scrollingElement.scrollHeight - clientHeight, clientHeight);
		const scrollWidth = Math.max(scrollingElement.scrollWidth - clientWidth, clientWidth);
		document.querySelectorAll("[loading=lazy]").forEach(element => {
			element.loading = "eager";
			element.setAttribute(LAZY_LOAD_ATTRIBUTE, "");
		});
		scrollingElement.__defineGetter__("clientHeight", () => scrollHeight);
		scrollingElement.__defineGetter__("clientWidth", () => scrollWidth);
		screen.__defineGetter__("height", () => scrollHeight);
		screen.__defineGetter__("width", () => scrollWidth);
		window._singleFile_innerHeight = window.innerHeight;
		window._singleFile_innerWidth = window.innerWidth;
		window.__defineGetter__("innerHeight", () => scrollHeight);
		window.__defineGetter__("innerWidth", () => scrollWidth);
		if (!keepZoomLevel) {
			if (!window._singleFile_getBoundingClientRect) {
				window._singleFile_getBoundingClientRect = Element.prototype.getBoundingClientRect;
				Element.prototype.getBoundingClientRect = function () {
					const boundingRect = window._singleFile_getBoundingClientRect.call(this);
					if (this == scrollingElement) {
						boundingRect.__defineGetter__("height", () => scrollHeight);
						boundingRect.__defineGetter__("bottom", () => scrollHeight + boundingRect.top);
						boundingRect.__defineGetter__("width", () => scrollWidth);
						boundingRect.__defineGetter__("right", () => scrollWidth + boundingRect.left);
					}
					return boundingRect;
				};
			}
		}
		if (!window._singleFileImage) {
			const Image = window.Image;
			window._singleFileImage = window.Image;
			window.__defineGetter__("Image", function () {
				return function () {
					const image = new Image(...arguments);
					const result = new Image(...arguments);
					result.__defineSetter__("src", function (value) {
						image.src = value;
						dispatchEvent(new CustomEvent(LOAD_IMAGE_EVENT, { detail: image.src }));
					});
					result.__defineGetter__("src", function () {
						return image.src;
					});
					result.__defineSetter__("srcset", function (value) {
						dispatchEvent(new CustomEvent(LOAD_IMAGE_EVENT));
						image.srcset = value;
					});
					result.__defineGetter__("srcset", function () {
						return image.srcset;
					});
					image.onload = image.onloadend = image.onerror = event => {
						dispatchEvent(new CustomEvent(IMAGE_LOADED_EVENT, { detail: image.src }));
						result.dispatchEvent(new UIEvent(event.type, event));
					};
					if (image.decode) {
						result.decode = () => image.decode();
					}
					return result;
				};
			});
		}
		let zoomFactorX, zoomFactorY;
		if (keepZoomLevel) {
			zoomFactorX = clientHeight / scrollHeight;
			zoomFactorY = clientWidth / scrollWidth;
		} else {
			zoomFactorX = (clientHeight + window.scrollY) / scrollHeight;
			zoomFactorY = (clientWidth + window.scrollX) / scrollWidth;
		}
		const zoomFactor = Math.min(zoomFactorX, zoomFactorY);
		if (zoomFactor < 1) {
			const transform = document.documentElement.style.getPropertyValue("transform");
			const transformPriority = document.documentElement.style.getPropertyPriority("transform");
			const transformOrigin = document.documentElement.style.getPropertyValue("transform-origin");
			const transformOriginPriority = document.documentElement.style.getPropertyPriority("transform-origin");
			const minHeight = document.documentElement.style.getPropertyValue("min-height");
			const minHeightPriority = document.documentElement.style.getPropertyPriority("min-height");
			document.documentElement.style.setProperty("transform-origin", (zoomFactorX < 1 ? "50%" : "0") + " " + (zoomFactorY < 1 ? "50%" : "0") + " 0", "important");
			document.documentElement.style.setProperty("transform", "scale3d(" + zoomFactor + ", " + zoomFactor + ", 1)", "important");
			document.documentElement.style.setProperty("min-height", (100 / zoomFactor) + "vh", "important");
			dispatchResizeEvent();
			if (keepZoomLevel) {
				document.documentElement.style.setProperty("-sf-transform", transform, transformPriority);
				document.documentElement.style.setProperty("-sf-transform-origin", transformOrigin, transformOriginPriority);
				document.documentElement.style.setProperty("-sf-min-height", minHeight, minHeightPriority);
			} else {
				document.documentElement.style.setProperty("transform", transform, transformPriority);
				document.documentElement.style.setProperty("transform-origin", transformOrigin, transformOriginPriority);
				document.documentElement.style.setProperty("min-height", minHeight, minHeightPriority);
			}
		}
		if (!keepZoomLevel) {
			dispatchResizeEvent();
			const docBoundingRect = scrollingElement.getBoundingClientRect();
			[...observers].forEach(([intersectionObserver, observer]) => {
				const getBoundingClientRectDefined = observer.options && observer.options.root && observer.options.root.getBoundingClientRect;
				const rootBoundingRect = getBoundingClientRectDefined && observer.options.root.getBoundingClientRect();
				const targetElements = observedElements.get(intersectionObserver);
				if (targetElements) {
					observer.callback(targetElements.map(target => {
						const boundingClientRect = target.getBoundingClientRect();
						const isIntersecting = true;
						const intersectionRatio = 1;
						const rootBounds = getBoundingClientRectDefined ? rootBoundingRect : docBoundingRect;
						const time = 0;
						return { target, intersectionRatio, boundingClientRect, intersectionRect: boundingClientRect, isIntersecting, rootBounds, time };
					}), intersectionObserver);
				}
			});
		}
	}

	addEventListener(LOAD_DEFERRED_IMAGES_END_EVENT, () => loadDeferredImagesEnd());
	addEventListener(LOAD_DEFERRED_IMAGES_KEEP_ZOOM_LEVEL_END_EVENT, () => loadDeferredImagesEnd(true));
	addEventListener(LOAD_DEFERRED_IMAGES_RESET_EVENT, resetScreenSize);
	addEventListener(LOAD_DEFERRED_IMAGES_RESET_ZOOM_LEVEL_EVENT, () => {
		const transform = document.documentElement.style.getPropertyValue("-sf-transform");
		const transformPriority = document.documentElement.style.getPropertyPriority("-sf-transform");
		const transformOrigin = document.documentElement.style.getPropertyValue("-sf-transform-origin");
		const transformOriginPriority = document.documentElement.style.getPropertyPriority("-sf-transform-origin");
		const minHeight = document.documentElement.style.getPropertyValue("-sf-min-height");
		const minHeightPriority = document.documentElement.style.getPropertyPriority("-sf-min-height");
		document.documentElement.style.setProperty("transform", transform, transformPriority);
		document.documentElement.style.setProperty("transform-origin", transformOrigin, transformOriginPriority);
		document.documentElement.style.setProperty("min-height", minHeight, minHeightPriority);
		document.documentElement.style.removeProperty("-sf-transform");
		document.documentElement.style.removeProperty("-sf-transform-origin");
		document.documentElement.style.removeProperty("-sf-min-height");
		resetScreenSize();
	});

	function loadDeferredImagesEnd(keepZoomLevel) {
		document.querySelectorAll("[" + LAZY_LOAD_ATTRIBUTE + "]").forEach(element => {
			element.loading = "lazy";
			element.removeAttribute(LAZY_LOAD_ATTRIBUTE);
		});
		if (!keepZoomLevel) {
			if (window._singleFile_getBoundingClientRect) {
				Element.prototype.getBoundingClientRect = window._singleFile_getBoundingClientRect;
				delete window._singleFile_getBoundingClientRect;
			}
		}
		if (window._singleFileImage) {
			delete window.Image;
			window.Image = window._singleFileImage;
			delete window._singleFileImage;
		}
		if (!keepZoomLevel) {
			dispatchResizeEvent();
		}
	}

	function resetScreenSize() {
		const scrollingElement = document.scrollingElement || document.documentElement;
		if (window._singleFile_innerHeight != null) {
			window.innerHeight = window._singleFile_innerHeight;
			delete window._singleFile_innerHeight;
		}
		if (window._singleFile_innerWidth != null) {
			window.innerWidth = window._singleFile_innerWidth;
			delete window._singleFile_innerWidth;
		}
		delete scrollingElement.clientHeight;
		delete scrollingElement.clientWidth;
		delete screen.height;
		delete screen.width;
	}

	addEventListener(BLOCK_COOKIES_START_EVENT, () => {
		try {
			document.__defineGetter__("cookie", () => { throw new Error("document.cookie temporary blocked by SingleFileZ"); });
		} catch (error) {
			// ignored
		}
	});

	addEventListener(BLOCK_COOKIES_END_EVENT, () => {
		delete document.cookie;
	});

	addEventListener(BLOCK_STORAGE_START_EVENT, () => {
		if (!window._singleFile_localStorage) {
			window._singleFile_localStorage = window.localStorage;
			window.__defineGetter__("localStorage", () => { throw new Error("localStorage temporary blocked by SingleFileZ"); });
		}
		if (!window._singleFile_indexedDB) {
			window._singleFile_indexedDB = window.indexedDB;
			window.__defineGetter__("indexedDB", () => { throw new Error("indexedDB temporary blocked by SingleFileZ"); });
		}
	});

	addEventListener(BLOCK_STORAGE_END_EVENT, () => {
		if (window._singleFile_localStorage) {
			delete window.localStorage;
			window.localStorage = window._singleFile_localStorage;
			delete window._singleFile_localStorage;
		}
		if (!window._singleFile_indexedDB) {
			delete window.indexedDB;
			window.indexedDB = window._singleFile_indexedDB;
			delete window._singleFile_indexedDB;
		}
	});

	if (window.FontFace) {
		const FontFace = window.FontFace;
		let warningFontFaceDisplayed;
		window.FontFace = function () {
			if (!warningFontFaceDisplayed) {
				warn("SingleFile is hooking the FontFace constructor to get font URLs."); // eslint-disable-line no-console
				warningFontFaceDisplayed = true;
			}
			const detail = {};
			detail["font-family"] = arguments[0];
			detail.src = arguments[1];
			const descriptors = arguments[2];
			if (descriptors) {
				Object.keys(descriptors).forEach(descriptor => {
					if (FONT_STYLE_PROPERTIES[descriptor]) {
						detail[FONT_STYLE_PROPERTIES[descriptor]] = descriptors[descriptor];
					}
				});
			}
			if (detail.src instanceof ArrayBuffer) {
				const reader = new FileReader();
				reader.readAsDataURL(new Blob([detail.src]));
				reader.addEventListener("load", () => {
					detail.src = "url(" + reader.result + ")";
					dispatchEvent(new CustomEvent(NEW_FONT_FACE_EVENT, { detail }));
				});
			} else {
				dispatchEvent(new CustomEvent(NEW_FONT_FACE_EVENT, { detail }));
			}
			return new FontFace(...arguments);
		};
		window.FontFace.toString = function () { return "function FontFace() { [native code] }"; };
	}

	if (window.IntersectionObserver) {
		const IntersectionObserver = window.IntersectionObserver;
		let warningIntersectionObserverDisplayed;
		window.IntersectionObserver = function () {
			if (!warningIntersectionObserverDisplayed) {
				warn("SingleFile is hooking the IntersectionObserver API to detect and load deferred images."); // eslint-disable-line no-console
				warningIntersectionObserverDisplayed = true;
			}
			const intersectionObserver = new IntersectionObserver(...arguments);
			const observeIntersection = IntersectionObserver.prototype.observe || intersectionObserver.observe;
			const unobserveIntersection = IntersectionObserver.prototype.unobserve || intersectionObserver.unobserve;
			const callback = arguments[0];
			const options = arguments[1];
			if (observeIntersection) {
				intersectionObserver.observe = function (targetElement) {
					let targetElements = observedElements.get(intersectionObserver);
					if (!targetElements) {
						targetElements = [];
						observedElements.set(intersectionObserver, targetElements);
					}
					targetElements.push(targetElement);
					return observeIntersection.call(intersectionObserver, targetElement);
				};
			}
			if (unobserveIntersection) {
				intersectionObserver.unobserve = function (targetElement) {
					let targetElements = observedElements.get(intersectionObserver);
					if (targetElements) {
						targetElements = targetElements.filter(element => element != targetElement);
						if (targetElements.length) {
							observedElements.set(intersectionObserver, targetElements);
						} else {
							observedElements.delete(intersectionObserver);
							observers.delete(intersectionObserver);
						}
					}
					return unobserveIntersection.call(intersectionObserver, targetElement);
				};
			}
			observers.set(intersectionObserver, { callback, options });
			return intersectionObserver;
		};
		window.IntersectionObserver.prototype = IntersectionObserver.prototype;
		window.IntersectionObserver.toString = function () { return "function IntersectionObserver() { [native code] }"; };
	}

	function dispatchResizeEvent() {
		try {
			dispatchEvent(new UIEvent("resize"));			
		} catch (error) {
			// ignored
		}
	}

})();