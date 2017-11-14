/// <reference types="cesium" />
import { SessionService, SessionPort } from './session';
import { Event } from './utils';
import { SerializedEntityState, SerializedEntityStateMap } from './common';
import { PermissionServiceProvider } from './permission';
import { Cartesian3, Cartographic, Entity, EntityCollection, JulianDate, ReferenceFrame, Transforms, Quaternion } from './cesium/cesium-imports';
/**
 * Represents the pose of an entity relative to a particular reference frame.
 *
 * The `update` method must be called in order to update the position / orientation / poseStatus.
 */
export declare class EntityPose {
    private _collection;
    constructor(_collection: EntityCollection, entityOrId: Entity | string, referenceFrameId: Entity | ReferenceFrame | string);
    private _entity;
    private _referenceFrame;
    readonly entity: Entity;
    readonly referenceFrame: Entity | ReferenceFrame;
    /**
     * The status of this pose, as a bitmask.
     *
     * If the current pose is known, then the KNOWN bit is 1.
     * If the current pose is not known, then the KNOWN bit is 0.
     *
     * If the previous pose was known and the current pose is unknown,
     * then the LOST bit is 1.
     * If the previous pose was unknown and the current pose status is known,
     * then the FOUND bit is 1.
     * In all other cases, both the LOST bit and the FOUND bit are 0.
     */
    status: PoseStatus;
    /**
     * alias for status
     */
    readonly poseStatus: PoseStatus;
    position: Cartesian3;
    orientation: Quaternion;
    time: JulianDate;
    previousTime: JulianDate;
    previousPosition: Cartesian3;
    previousOrientation: Quaternion;
    previousStatus: PoseStatus;
    private _getEntityPositionInReferenceFrame;
    private _getEntityOrientationInReferenceFrame;
    update(time: JulianDate): void;
}
/**
* A bitmask that provides metadata about an EntityPose.
*   KNOWN - the pose of the entity is defined for the current frame time
*   FOUND - the pose was undefined at the previous frame time, and is now defined
*   LOST - the pose was defined at the previous frame time, and is now undefined
*   CHANGED - the pose has changed since the previous frame time
*/
export declare enum PoseStatus {
    KNOWN = 1,
    FOUND = 2,
    LOST = 4,
    CHANGED = 8,
}
/**
 * A service for subscribing/unsubscribing to entities
 */
export declare class EntityService {
    protected sessionService: SessionService;
    constructor(sessionService: SessionService);
    collection: EntityCollection;
    subscribedEvent: Event<{
        id: string;
        options?: {} | undefined;
    }>;
    unsubscribedEvent: Event<{
        id: string;
    }>;
    subscriptions: Map<string, {}>;
    private _handleSubscribed(evt);
    private _handleUnsubscribed(id);
    private _scratchCartesian;
    private _scratchQuaternion;
    private _scratchMatrix3;
    private _scratchMatrix4;
    private _getEntityPositionInReferenceFrame;
    /**
     * Get the cartographic position of an Entity at the given time
     */
    getCartographic(entity: Entity, time: JulianDate, result?: Cartographic): Cartographic | undefined;
    /**
    * Create an entity that is positioned at the given cartographic location,
    * with an orientation computed according to the provided `localToFixed` transform function.
    *
    * For the `localToFixed` parameter, you can pass any of the following:
    *
    * ```
    * Argon.Cesium.Transforms.eastNorthUpToFixedFrame
    * Argon.Cesium.Transforms.northEastDownToFixedFrame
    * Argon.Cesium.Transforms.northUpEastToFixedFrame
    * Argon.Cesium.Transforms.northWestUpToFixedFrame
    * ```
    *
    * Additionally, argon.js provides:
    *
    * ```
    * Argon.eastUpSouthToFixedFrame
    * ```
    *
    * Alternative transform functions can be created with:
    *
    * ```
    * Argon.Cesium.Transforms.localFrameToFixedFrameGenerator
    * ```
    */
    createFixed(cartographic: Cartographic, localToFixed: typeof Transforms.northUpEastToFixedFrame): Entity;
    /**
     * Subscribe to pose updates for the given entity id
     * @returns A Promise that resolves to a new or existing entity
     */
    subscribe(idOrEntity: string | Entity): Promise<Entity>;
    subscribe(idOrEntity: string | Entity, options?: {}, session?: SessionPort): Promise<Entity>;
    /**
     * Unsubscribe from pose updates for the given entity id
     */
    unsubscribe(idOrEntity: any): void;
    unsubscribe(idOrEntity: string | Entity, session?: SessionPort): void;
    /**
     * Create a new EntityPose instance to represent the pose of an entity
     * relative to a given reference frame.
     *
     * @param entity - the entity to track
     * @param referenceFrameOrId - the reference frame to use
     */
    createEntityPose(entityOrId: Entity | string, referenceFrameOrId: string | ReferenceFrame | Entity): EntityPose;
    private _entityPoseMap;
    private _stringIdentifierFromReferenceFrame;
    /**
     * Gets the pose of an entity, relative to a given reference frame at a given time.
     *
     * @param entityOrId - The entity whose state is to be queried.
     * @param referenceFrameOrId - The intended reference frame. Defaults to `this.defaultReferenceFrame`.
     */
    getEntityPose(entityOrId: Entity | string, referenceFrameOrId: string | ReferenceFrame | Entity, time: JulianDate): EntityPose;
    /**
     *
     * @param id
     * @param entityState
     */
    updateEntityFromSerializedState(id: string, entityState: SerializedEntityState | null): Entity;
}
/**
 * A service for publishing entity states to managed sessions
 */
export declare class EntityServiceProvider {
    private sessionService;
    private entityService;
    private permissionServiceProvider;
    subscriptionsBySubscriber: WeakMap<SessionPort, {
        [entityId: string]: {} | undefined;
    }>;
    subscribersByEntity: Map<string, Set<SessionPort>>;
    sessionSubscribedEvent: Event<{
        session: SessionPort;
        id: string;
        options: {};
    }>;
    sessionUnsubscribedEvent: Event<{
        session: SessionPort;
        id: string;
    }>;
    constructor(sessionService: SessionService, entityService: EntityService, permissionServiceProvider: PermissionServiceProvider);
    /**
     * Serialize into a serialization state mpat, the given entities using the given time.
     * Serialization includes the ancestor reference frames of included, excluding any entities in the excludedFrames list.
     */
    fillEntityStateMap(entities: SerializedEntityStateMap, time: JulianDate, includedMap: {}, excludedMap: {}): void;
    private _cacheTime;
    private _entityStateCache;
    private _getSerializedEntityState;
    private _getCachedSerializedEntityState(entity, time, referenceFrame);
}
