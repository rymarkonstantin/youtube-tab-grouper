/**
 * @typedef {Object} Metadata
 * @property {string} title
 * @property {string} channel
 * @property {string} description
 * @property {string[]} keywords
 * @property {string|number|null} youtubeCategory
 */

/**
 * @typedef {Object} MessageEnvelope
 * @property {string} action
 * @property {number} version
 * @property {string} requestId
 */

/**
 * @typedef {Object} GroupTabRequest
 * @property {string} [category]
 * @property {Metadata} [metadata]
 */

/**
 * @typedef {Object} GroupTabResponse
 * @property {boolean} success
 * @property {string} [category]
 * @property {string} [color]
 * @property {string} [error]
 */

/**
 * @typedef {Object} SendMessageOptions
 * @property {number} [tabId]
 * @property {number} [timeoutMs]
 * @property {string} [requestId]
 * @property {boolean} [requireVersion]
 * @property {boolean} [validateResponsePayload]
 */

/**
 * @typedef {Object} HandleMessageOptions
 * @property {boolean} [requireVersion]
 * @property {boolean} [validateResponses]
 * @property {(action:string,msg:any,sender:any)=>any} [onUnknown]
 */

/**
 * @typedef {Object} Settings
 * @property {number} autoGroupDelay
 * @property {number} autoGroupDelayMs
 * @property {number} autoCleanupGraceMs
 * @property {string[]} allowedHashtags
 * @property {Record<string,string>} channelCategoryMap
 * @property {boolean} extensionEnabled
 * @property {Record<string,boolean>} enabledColors
 * @property {boolean} autoCleanupEnabled
 * @property {boolean} aiCategoryDetection
 * @property {Record<string,string[]>} categoryKeywords
 * @property {number} [version]
 */

/**
 * @typedef {Object} GroupingStats
 * @property {number} totalTabs
 * @property {Record<string, number>} categoryCount
 * @property {number} sessionsToday
 * @property {string} lastReset
 * @property {number} [version]
 */

export {};
