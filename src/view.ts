import {inject} from 'aurelia-dependency-injection'
import {defined, Entity, Matrix4, PerspectiveFrustum} from './cesium/cesium-imports'
import {Viewport, SubviewType, SerializedFrameState, SerializedEyeParameters, SerializedEntityPose, SerializedViewParameters} from './common'
import {SessionService, SessionPort} from './session'
import {EntityPose, ContextService} from './context'
import {Event} from './utils'
import {FocusService} from './focus'

// setup our DOM environment
if (typeof document !== 'undefined' && document.createElement) {
    let viewportMetaTag = <HTMLMetaElement>document.querySelector('meta[name=viewport]');
    if (!viewportMetaTag) viewportMetaTag = document.createElement('meta');
    viewportMetaTag.name = 'viewport'
    viewportMetaTag.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0'
    document.head.appendChild(viewportMetaTag);

    let argonMetaTag = <HTMLMetaElement>document.querySelector('meta[name=argon]');
    if (!argonMetaTag) argonMetaTag = document.createElement('meta');
    argonMetaTag.name = 'argon'
    document.head.appendChild(argonMetaTag);

    var argonContainerPromise = new Promise<HTMLElement>((resolve) => {
        document.addEventListener('DOMContentLoaded', () => {
            let container = <HTMLDivElement>document.querySelector('#argon');
            if (!container) container = document.createElement('div');
            container.id = 'argon';
            container.classList.add('argon-view');
            document.body.appendChild(container);
            resolve(container);
        })
    })

    const style = document.createElement("style");
    style.type = 'text/css';
    document.head.insertBefore(style, document.head.firstChild);
    const sheet = <CSSStyleSheet>style.sheet;
    sheet.insertRule(`
        #argon {
            position: fixed;
            left: 0px;
            bottom: 0px;
            width: 100%;
            height: 100%;
            margin: 0;
            border: 0;
            padding: 0;
        }
    `, 0);
    sheet.insertRule(`
        .argon-view > * {
            position: absolute;
            pointer-events: none;
        }
    `, 1);
}

/**
 * The rendering paramters for a particular subview
 */
export interface Subview {
    index: number,
    type: SubviewType,
    projectionMatrix: Array<number>,
    pose: EntityPose,
    viewport: Viewport
}

/**
 * Manages the view state
 */
@inject('containerElement', SessionService, FocusService, ContextService)
export class ViewService {

    /**
     * An event that is raised when the root viewport has changed
     */
    public viewportChangeEvent = new Event<{ previous: Viewport }>();

    /**
     * An event that is raised when ownership of the view has been acquired by this application
     */
    public acquireEvent = new Event<void>();

    /** 
     * An event that is raised when ownership of the view has been released from this application
    */
    public releaseEvent = new Event<void>();

    /**
     * An HTMLDivElement which matches the root viewport. This is 
     * provide for convenience to attach other elements to (such as
     * a webGL canvas element). Attached elements will automatically 
     * inherit the same size and position as this element (via CSS). 
     */
    public element: HTMLDivElement;

    public desiredViewportMap = new WeakMap<SessionPort, Viewport>();

    private _current: SerializedViewParameters;
    private _currentViewportJSON: string;

    private _subviewEntities: Entity[] = [];

    constructor(
        public containerElement: HTMLElement,
        private sessionService: SessionService,
        private focusService: FocusService,
        private contextService: ContextService) {

        if (typeof document !== 'undefined' && document.createElement) {
            const element = this.element = document.createElement('div');
            element.style.width = '100%';
            element.style.height = '100%';
            element.classList.add('argon-view');

            if (this.containerElement) {
                this.containerElement.insertBefore(element, this.containerElement.firstChild);
            } else {
                argonContainerPromise.then((argonContainer) => {
                    this.containerElement = argonContainer;
                    this.containerElement.insertBefore(element, this.containerElement.firstChild);
                })
                this.focusService.focusEvent.addEventListener(() => {
                    argonContainerPromise.then((argonContainer) => {
                        argonContainer.classList.remove('argon-no-focus');
                        argonContainer.classList.add('argon-focus');
                    })
                })
                this.focusService.blurEvent.addEventListener(() => {
                    argonContainerPromise.then((argonContainer) => {
                        argonContainer.classList.remove('argon-focus');
                        argonContainer.classList.add('argon-no-focus');
                    })
                })
            }
        }

        if (this.sessionService.isManager) {
            this.sessionService.connectEvent.addEventListener((session) => {
                session.on['ar.viewport.desired'] = (viewport: Viewport) => {
                    this.desiredViewportMap.set(session, viewport);
                }
            });

            this.contextService.prepareEvent.addEventListener(({serializedState, state}) => {
                if (!defined(state.view)) {
                    if (!defined(serializedState.eye))
                        throw new Error("Unable to construct view configuration: missing eye parameters");
                    state.view = this.generateViewFromEyeParameters(serializedState.eye);
                    if (!Array.isArray(state.view.subviews[0].projectionMatrix))
                        throw new Error("Expected projectionMatrix to be an Array<number>");
                }
            })
        }

        this.contextService.renderEvent.addEventListener(() => {
            const state = this.contextService.state;
            const subviewEntities = this._subviewEntities;
            subviewEntities.length = 0;
            state.view.subviews.forEach((subview, index) => {
                const id = 'ar.view_' + index;
                state.entities[id] = subview.pose || state.view.pose;
                this.contextService.updateEntityFromFrameState(id, state);
                delete state.entities[id];
                subviewEntities[index] = this.contextService.entities.getById(id);
            });
            this.update();
        })
    }

    public getSubviews(referenceFrame?: Entity): Subview[] {
        this.update();
        let subviews: Subview[] = [];
        this._current.subviews.forEach((subview, index) => {
            const subviewEntity = this._subviewEntities[index];
            subviews[index] = {
                index: index,
                type: subview.type,
                pose: this.contextService.getEntityPose(subviewEntity, referenceFrame),
                projectionMatrix: <Array<number>>subview.projectionMatrix,
                viewport: subview.viewport || this._current.viewport
            }
        })
        return subviews;
    }

    public getViewport() {
        return this._current.viewport;
    }

    /**
     * Set the desired root viewport
     */
    public setDesiredViewport(viewport: Viewport) {
        this.sessionService.manager.send('ar.view.desiredViewport', viewport)
    }

    /**
     * Request control over the view. 
     * The manager is likely to reject this request if this application is not in focus. 
     * When running on an HMD, this request will always fail. If the current reality view
     * does not support custom views, this request will fail. The manager may revoke
     * ownership at any time (even without this application calling releaseOwnership)
     */
    public requestOwnership() {

    }

    /**
     * Release control over the view. 
     */
    public releaseOwnership() {

    }

    /**
     * Returns true if this application has control over the view.  
     */
    public isOwner() {

    }

    /**
     * Returns a maximum viewport
     */
    public getMaximumViewport() {
        if (typeof document !== 'undefined' && document.documentElement) {
            return {
                x: 0,
                y: 0,
                width: document.documentElement.clientWidth,
                height: document.documentElement.clientHeight
            }
        }
        throw new Error("Not implemeneted for the current platform");
    }

    private _scratchFrustum = new PerspectiveFrustum();
    private _scratchArray = [];
    protected generateViewFromEyeParameters(eye: SerializedEyeParameters): SerializedViewParameters {
        const viewport = this.getMaximumViewport();
        this._scratchFrustum.fov = eye.fov || Math.PI / 3;
        this._scratchFrustum.aspectRatio = viewport.width / viewport.height;
        this._scratchFrustum.near = 0.01;
        return {
            viewport,
            pose: eye.pose,
            subviews: [
                {
                    type: SubviewType.SINGULAR,
                    projectionMatrix: Matrix4.toArray(this._scratchFrustum.infiniteProjectionMatrix, this._scratchArray)
                }
            ]
        }
    }

    public update() {
        const view = this.contextService.state.view;
        const viewportJSON = JSON.stringify(view.viewport);
        const previousViewport = this._current && this._current.viewport;
        this._current = view;

        if (!this._currentViewportJSON || this._currentViewportJSON !== viewportJSON) {
            this._currentViewportJSON = viewportJSON;

            if (this.element) {
                const viewport = view.viewport;
                this.element.style.left = viewport.x + 'px';
                this.element.style.bottom = viewport.y + 'px';
                this.element.style.width = (viewport.width / document.documentElement.clientWidth) * 100 + '%';
                this.element.style.height = (viewport.height / document.documentElement.clientHeight) * 100 + '%';
            }

            this.viewportChangeEvent.raiseEvent({ previous: previousViewport })
        }
    }
}
