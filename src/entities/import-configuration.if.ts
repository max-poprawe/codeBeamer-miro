/**
 * Defines the structure of the object that configures import options.
 * Currently only holds information about what properties to synchronize.
 */
export interface ImportConfiguration {
    standard: Record<string, boolean>,
    trackerSpecific?: Record<string,boolean>[]
}