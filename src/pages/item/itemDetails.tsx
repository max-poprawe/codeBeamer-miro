import { useFormik } from 'formik';
import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Select from 'react-select';
import {
	useLazyGetItemQuery,
	useLazyGetFieldOptionsQuery,
	useLazyGetTrackerSchemaQuery,
	useLazyUpdateItemLegacyQuery,
	useLazyGetWiki2HtmlLegacyQuery,
} from '../../api/codeBeamerApi';
import { updateAppCard } from '../../api/miro.api';
import getRestResourceUri, {
	getIdFromRestResourceUri,
} from '../../api/utils/getRestResourceUri';
import mapToLegacyValue from '../../api/utils/mapToLegacyValue';
import {
	ASSIGNEE_FIELD_NAME,
	EDITABLE_ATTRIBUTES,
	STORY_POINTS_FIELD_NAME,
	SUBJECT_FIELD_NAME,
	TEAM_FIELD_NAME,
	VERSION_FIELD_NAME,
} from '../../constants/editable-attributes';
import { CodeBeamerItem } from '../../models/codebeamer-item.if';
import { CodeBeamerReferenceMinimal } from '../../models/codebeamer-reference.if';
import { displayAppMessage } from '../../store/slices/appMessagesSlice';
import { loadBoardSettings } from '../../store/slices/boardSettingsSlice';
import { RootState } from '../../store/store';

import './itemDetails.css';

interface Errors {
	assignedTo?: string;
	teams?: string;
	storyPoints?: string;
	versions?: string;
	subjects?: string;
}

/**
 * @param props Props are only used in testing - the values are passed via url query params else.
 */
export default function ItemDetails(props: {
	itemId?: string;
	cardId?: string;
}) {
	const dispatch = useDispatch();

	const [itemId] = useState<string>(
		props.itemId ??
			new URL(document.location.href).searchParams.get('itemId') ??
			''
	);
	const [cardId] = useState<string>(
		props.cardId ??
			new URL(document.location.href).searchParams.get('cardId') ??
			''
	);
	const [storeIsInitializing, setStoreIsInitializing] =
		useState<boolean>(true);
	const [item, setItem] = useState<CodeBeamerItem>();
	const [displayedItemDescription, setDisplayedItemDescription] =
		useState<string>('');
	const [trackerId, setTrackerId] = useState<string>();
	const [loading, setLoading] = useState<boolean>(true);
	const [animateSuccess, setAnimateSuccess] = useState<boolean>(false);

	const [selectOptions, setSelectOptions] = useState<
		{ key: string; values: any[] }[]
	>([]);
	const [disabledFields, setDisabledFields] = useState<
		{
			key: string;
			value: boolean;
		}[]
	>([]);

	const { cbAddress } = useSelector(
		(state: RootState) => state.boardSettings
	);

	const [triggerTrackerSchemaQuery, trackerSchemaQueryResult] =
		useLazyGetTrackerSchemaQuery();
	const [triggerItemQuery, itemQueryResult] = useLazyGetItemQuery();
	const [triggerFieldOptionsQuery, fieldOptionsQueryResult] =
		useLazyGetFieldOptionsQuery();
	const [triggerUpdateItem, updateItemResult] =
		useLazyUpdateItemLegacyQuery();
	const [triggerWiki2HtmlQuery, wiki2HtmlQueryResult] =
		useLazyGetWiki2HtmlLegacyQuery();

	React.useEffect(() => {
		if (!itemId || !cardId) {
			console.error(
				'Item page called without itemId and/or cardId in query.'
			);
			return;
		}
		dispatch(loadBoardSettings());
	}, []);

	/**
	 * {@link cbAddress} and {@link storeIsInitializing} subscription
	 *
	 * Will run its logic only once both values are truthy, which will then
	 * claim the store to be initialized and trigger the Item- and TrackerSchema queries
	 */
	React.useEffect(() => {
		if (cbAddress && storeIsInitializing) {
			// console.log('Cb address truthy: ', cbAddress);
			setStoreIsInitializing(false);
			triggerItemQuery(itemId!);
		}
	}, [cbAddress, storeIsInitializing]);

	/**
	 * Handler for when we receive the tracker schema (or an error when trying to load it)
	 *
	 * Will loop over the {@link EDITABLE_ATTRIBUTES} if we have a schema, and check which of these attributes have a counterpart
	 * in the current tracker (meaning either the "trcakerItemField" or "legacyRestName" match the attribute's respective values).
	 *
	 * Updates {@link disabledFields} with these findings, which can then be used to disable / hide the inputs which this tracker doesn't have a field for.
	 */
	React.useEffect(() => {
		if (trackerSchemaQueryResult.error) {
			console.error(
				"Failed loading Tracker Schema - Won't be able to propose any options"
			);
			//TODO error notif
		} else if (trackerSchemaQueryResult.data) {
			//*register disabledFields - so that fields that don't exist on this tracker are disabled / don't show up
			const disabledFields = [];
			for (let attr of EDITABLE_ATTRIBUTES) {
				disabledFields.push({
					key: attr.name,
					value: !trackerSchemaQueryResult.data.some(
						(d) =>
							d.trackerItemField == attr.name ||
							d.legacyRestName == attr.legacyName
					),
				});
				setDisabledFields(disabledFields);
				// only show inputs once the schema has been loaded and the fields are properly enabled/disabled (which also allows just hiding them)
				setLoading(false);
			}
		}
	}, [trackerSchemaQueryResult]);

	/**
	 * {@link itemQueryResult} subscription
	 *
	 * Sets the item's data and will also update the card for it.
	 */
	React.useEffect(() => {
		if (itemQueryResult.error) {
			//TODO
		} else if (itemQueryResult.data) {
			setTrackerId(itemQueryResult.data.tracker.id.toString());
			setItem(itemQueryResult.data);
			triggerTrackerSchemaQuery(
				itemQueryResult.data.tracker.id.toString()
			);
			setDisplayedItemDescription(itemQueryResult.data.description);
			console.log('Triggering wiki2html, odr');
			triggerWiki2HtmlQuery({
				itemId: itemQueryResult.data.id,
				markup: itemQueryResult.data.description,
			});
			updateAppCard(itemQueryResult.data, cardId);
		}
	}, [itemQueryResult]);

	/**
	 * {@link wiki2HtmlQueryResult} subscription
	 *
	 * Updates the value for the displayed description, when it gets a response
	 */
	React.useEffect(() => {
		if (wiki2HtmlQueryResult.error) {
			console.warn('Failed to convert wiki description to html');
		}
		if (wiki2HtmlQueryResult.data) {
			setDisplayedItemDescription(wiki2HtmlQueryResult.data);
		}
	}, [wiki2HtmlQueryResult]);

	/**
	 * {@link updateItemResult} subscription
	 */
	React.useEffect(() => {
		if (updateItemResult.error) {
			console.error('Failed to update item: ', updateItemResult.error);
			dispatch(
				displayAppMessage({
					header: 'Failed to update item: ' + updateItemResult.error,
					bg: 'danger',
					delay: 2500,
				})
			);
		}
		if (updateItemResult.data) {
			console.log('Updated with data ', updateItemResult.data);
			setAnimateSuccess(true);
			setTimeout(() => {
				setAnimateSuccess(false);
			}, 2000);
		}
	}, [updateItemResult]);

	/**
	 * Will trigger fetching options (tracker/{id}/field/{id}/options) for given field
	 *
	 * Mind that triggering this again before the previous response has been received & processed will
	 * cancel the ongoing one, since they're using the same api endpoint implementation.
	 *
	 * @param fieldName Name of the field
	 * @returns void, see the respective effect for how the query's result is handled
	 */
	const fetchOptions = (fieldName: string) => {
		//*if already loaded, return. we get all options at once - no further lazy loading
		if (
			selectOptions.find((o) => o.key == fieldName) ||
			disabledFields.find((f) => f.key == fieldName)?.value
		) {
			return;
		}
		//the second can't be true if the first isn't, but the compiler doesn't know that much
		if (!trackerSchemaQueryResult.data || !trackerId) {
			return;
		}
		const fieldId = trackerSchemaQueryResult.data.find(
			(d) => d.trackerItemField == fieldName
		)?.id;
		if (!fieldId) {
			//TODO error: can't load options
			console.warn(
				"Can't find field for assignee in Tracker schema - therefore can't load options."
			);
			return;
		}
		triggerFieldOptionsQuery({ trackerId, fieldId });
	};

	/**
	 * {@link fieldOptionsQueryResult} error subscription
	 */
	React.useEffect(() => {
		if (fieldOptionsQueryResult.error) {
			console.error(fieldOptionsQueryResult.error);
			//TODO display
		}
	}, [fieldOptionsQueryResult.error]);

	/**
	 * {@link fieldOptionsQueryResult} data update subscription
	 *
	 * Will update the {@link selectOptions} with the here-received options for the field the request was made for.
	 */
	React.useEffect(() => {
		if (fieldOptionsQueryResult.data) {
			const fieldId = fieldOptionsQueryResult.originalArgs?.fieldId;
			if (!fieldId) {
				console.warn(
					"Can't determine which field the received data are options for."
				);
			} else {
				const fieldName = trackerSchemaQueryResult.data?.find(
					(d) => d.id == fieldId
				)?.trackerItemField;
				if (!fieldName) {
					console.warn(
						"Can't determine which field the received data are options for."
					);
					return;
				}
				const options = [
					...selectOptions.filter((s) => s.key !== fieldName),
					{
						key: fieldName,
						values: fieldOptionsQueryResult.data,
					},
				];
				setSelectOptions(options);
			}
		}
	}, [fieldOptionsQueryResult.data]);

	/**
	 * @returns Whether the field for {@link fieldName} should be disabled (true) or not (false)
	 */
	const fieldIsDisabled = (fieldName: string): boolean => {
		return disabledFields.find((f) => f.key == fieldName)?.value ?? false;
	};

	//*********************************************************************** */
	//********************************RENDER********************************* */
	//*********************************************************************** */

	const formik = useFormik({
		initialValues: {
			assignedTo: item?.assignedTo
				? (item.assignedTo as CodeBeamerReferenceMinimal[])
				: [],
			teams: item?.teams
				? (item.teams as CodeBeamerReferenceMinimal[])
				: [],
			storyPoints: item?.storyPoints ?? -1,
			versions: item?.versions
				? (item.versions as CodeBeamerReferenceMinimal[])
				: [],
			subjects: item?.subjects
				? (item.subjects as CodeBeamerReferenceMinimal[])
				: [],
		},
		enableReinitialize: true,
		validate: (values) => {
			const errors: Errors = {};

			return errors;
		},
		onSubmit: (values) => {
			console.log('Submitting');
			//*mapping in the formik.setFieldValue calls would only affect fields where
			//*something really is updated, but leave the untouched ones in their inadequate structure

			//*mind the keys here; they're legacy field names, since we're using the legacy rest api to do the update
			//*(because the swagger api v3 is disgustingly complicated in that regard)

			//TODO check how items that don't have such fields are affected (probably gonna throw errors..)
			const payload = {
				uri: getRestResourceUri(item!.id),
				assignedTo: values.assignedTo.map(mapToLegacyValue),
				team: values.teams.map(mapToLegacyValue),
				versions: values.versions.map(mapToLegacyValue),
				realizedFeature: values.subjects.map(mapToLegacyValue),
				storyPoints: values.storyPoints,
			};

			triggerUpdateItem(payload);
		},
	});

	return (
		<>
			{loading && <div className="centered loading-spinner-lg"></div>}
			{!loading && item && (
				<div className="fade-in centered-horizontally h-100 flex-col w-max max-w-85">
					<div className="panel-header h-25">
						<div className="panel-title sticky">
							<h3 className="h3">
								{item.name} <small>#{item.id}</small>
							</h3>
						</div>
						<p
							className="overflow-ellipsis"
							dangerouslySetInnerHTML={{
								__html: displayedItemDescription,
							}}
						></p>
					</div>
					<hr />
					<div className="panel-content mt-1 h-64 overflow-auto">
						<h6 className="h6 pb-3">Editable attributes:</h6>
						<form
							onSubmit={formik.handleSubmit}
							className="flex-col position-relative"
						>
							{
								//*********************************************************************** */
								//********************************ASSIGNEE******************************* */
								//*********************************************************************** */
							}
							<div
								className={`form-group ${
									formik.touched.assignedTo
										? formik.errors.assignedTo
											? 'error'
											: 'success'
										: ''
								}`}
								onClick={() =>
									fetchOptions(ASSIGNEE_FIELD_NAME)
								}
							>
								<label data-test={ASSIGNEE_FIELD_NAME}>
									Assignee
								</label>
								<Select
									className="basic-single"
									classNamePrefix="select"
									options={
										selectOptions.find(
											(s) => s.key == ASSIGNEE_FIELD_NAME
										)?.values || []
									}
									value={formik.values.assignedTo}
									getOptionLabel={(option) => option.name}
									getOptionValue={(option) =>
										option.id
											? option.id.toString()
											: option.uri
											? getIdFromRestResourceUri(
													option.uri
											  )
											: '-1'
									}
									isLoading={
										fieldOptionsQueryResult.isFetching
									}
									isMulti={true}
									isSearchable={true}
									isClearable={true}
									isDisabled={
										!trackerSchemaQueryResult.data ||
										fieldIsDisabled(ASSIGNEE_FIELD_NAME)
									}
									onChange={(values) =>
										formik.setFieldValue(
											ASSIGNEE_FIELD_NAME,
											values
										)
									}
									maxMenuHeight={180}
								/>
							</div>

							{
								//*********************************************************************** */
								//********************************TEAM*********************************** */
								//*********************************************************************** */
							}
							<div
								className={`form-group ${
									formik.touched.teams
										? formik.errors.teams
											? 'error'
											: 'success'
										: ''
								}`}
								onClick={() => fetchOptions(TEAM_FIELD_NAME)}
							>
								<label data-test={TEAM_FIELD_NAME}>Team</label>
								<Select
									className="basic-single"
									classNamePrefix="select"
									options={
										selectOptions.find(
											(s) => s.key == TEAM_FIELD_NAME
										)?.values || []
									}
									value={formik.values.teams}
									getOptionLabel={(option) => option.name}
									getOptionValue={(option) =>
										option.id
											? option.id.toString()
											: option.uri
											? getIdFromRestResourceUri(
													option.uri
											  )
											: '-1'
									}
									isLoading={
										fieldOptionsQueryResult.isFetching
									}
									isMulti={true}
									isSearchable={true}
									isClearable={true}
									isDisabled={
										!trackerSchemaQueryResult.data ||
										fieldIsDisabled(TEAM_FIELD_NAME)
									}
									onChange={(values) =>
										formik.setFieldValue(
											TEAM_FIELD_NAME,
											values
										)
									}
									maxMenuHeight={180}
								/>
							</div>

							{
								//*********************************************************************** */
								//********************************VERSION******************************** */
								//*********************************************************************** */
							}

							<div
								className={`form-group ${
									formik.touched.versions
										? formik.errors.versions
											? 'error'
											: 'success'
										: ''
								}`}
								onClick={() => fetchOptions(VERSION_FIELD_NAME)}
							>
								<label data-test={VERSION_FIELD_NAME}>
									Version
								</label>
								<Select
									className="basic-single"
									classNamePrefix="select"
									options={
										selectOptions.find(
											(s) => s.key == VERSION_FIELD_NAME
										)?.values || []
									}
									value={formik.values.versions}
									getOptionLabel={(option) => option.name}
									getOptionValue={(option) =>
										option.id
											? option.id.toString()
											: option.uri
											? getIdFromRestResourceUri(
													option.uri
											  )
											: '-1'
									}
									isLoading={
										fieldOptionsQueryResult.isFetching
									}
									isMulti={true}
									isSearchable={true}
									isClearable={true}
									isDisabled={
										!trackerSchemaQueryResult.data ||
										fieldIsDisabled(VERSION_FIELD_NAME)
									}
									onChange={(values) =>
										formik.setFieldValue(
											VERSION_FIELD_NAME,
											values
										)
									}
									maxMenuHeight={180}
								/>
							</div>

							{
								//*********************************************************************** */
								//********************************SUBJECT******************************** */
								//*********************************************************************** */
							}

							<div
								className={`form-group ${
									formik.touched.subjects
										? formik.errors.subjects
											? 'error'
											: 'success'
										: ''
								}`}
								onClick={() => fetchOptions(SUBJECT_FIELD_NAME)}
							>
								<label data-test={SUBJECT_FIELD_NAME}>
									Subject
								</label>
								<Select
									className="basic-single"
									classNamePrefix="select"
									options={
										selectOptions.find(
											(s) => s.key == SUBJECT_FIELD_NAME
										)?.values || []
									}
									value={formik.values.subjects}
									getOptionLabel={(option) => option.name}
									getOptionValue={(option) =>
										option.id
											? option.id.toString()
											: option.uri
											? getIdFromRestResourceUri(
													option.uri
											  )
											: '-1'
									}
									isLoading={
										fieldOptionsQueryResult.isFetching
									}
									isMulti={true}
									isSearchable={true}
									isClearable={true}
									isDisabled={
										!trackerSchemaQueryResult.data ||
										fieldIsDisabled(SUBJECT_FIELD_NAME)
									}
									onChange={(values) =>
										formik.setFieldValue(
											SUBJECT_FIELD_NAME,
											values
										)
									}
									maxMenuHeight={180}
								/>
							</div>

							{
								//*********************************************************************** */
								//********************************STORY POINTS*************************** */
								//*********************************************************************** */
							}
							<div
								className={`form-group ${
									formik.touched.storyPoints
										? formik.errors.storyPoints
											? 'error'
											: 'success'
										: ''
								}`}
							>
								<label>Story Points</label>
								<input
									type="number"
									className="input"
									name={STORY_POINTS_FIELD_NAME}
									value={formik.values.storyPoints}
									onChange={(e) =>
										formik.setFieldValue(
											STORY_POINTS_FIELD_NAME,
											e.target.value
										)
									}
									disabled={
										!trackerSchemaQueryResult.data ||
										fieldIsDisabled(STORY_POINTS_FIELD_NAME)
									}
									data-test={STORY_POINTS_FIELD_NAME}
								/>
							</div>
						</form>
					</div>
					{
						//*********************************************************************** */
						//********************************SUBMIT********************************* */
						//*********************************************************************** */
					}

					<div className="absolute-bottom">
						{!animateSuccess && (
							<button
								type="submit"
								disabled={updateItemResult.isFetching}
								data-test="submit"
								className={`fade-in button button-primary ${
									updateItemResult.isFetching
										? 'button-loading'
										: ''
								}`}
								onClick={() => formik.handleSubmit()}
							>
								Save
							</button>
						)}
						{animateSuccess && (
							<span>
								<svg
									className="checkmark"
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 52 52"
								>
									<circle
										className="checkmark__circle"
										cx="26"
										cy="26"
										r="25"
										fill="none"
									/>
									<path
										className="checkmark__check"
										fill="none"
										d="M14.1 27.2l7.1 7.2 16.7-16.8"
									/>
								</svg>
							</span>
						)}
					</div>
				</div>
			)}
		</>
	);
}
