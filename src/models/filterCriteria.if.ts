/**
 * Defines structure of a filter criteria that can be used to filter a query with.
 */
export interface IFilterCriteria {
	/**
	 * Unique id among filterCriteria
	 */
	id: number;
	/**
	 * Human-readable displayname
	 */
	slug: string;
	/**
	 * Technical name used to filter by in the CBQL query
	 */
	fieldName: string;
	/**
	 * Value to filter by
	 */
	value: string;
}
