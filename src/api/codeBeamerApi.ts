import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { UserSetting } from '../store/userSetting.enum';
import { RootState } from '../store/store';
import { ProjectListView } from '../models/projectListView.if';
import { TrackerListView } from '../models/trackerListView.if';
import { ItemQueryPage } from '../models/itemQueryPage';
import { CodeBeamerItemsQuery } from '../models/itemQuery';

export const codeBeamerApi = createApi({
	baseQuery: fetchBaseQuery({
		baseUrl: `${localStorage.getItem(UserSetting.CB_ADDRESS)}/api/v3/`,
		prepareHeaders: (headers, { getState }) => {
			const token = btoa(
				`${(getState() as RootState).userSettings.cbUsername}:${
					(getState() as RootState).userSettings.cbPassword
				}`
			);

			if (token) {
				headers.set('Authorization', `Basic ${token}`);
			}

			return headers;
		},
	}),
	endpoints: (builder) => ({
		testAuthentication: builder.query<
			string,
			{ cbAddress: string; cbUsername: string; cbPassword: string }
		>({
			query: (payload) => `users/findByName?name=${payload.cbUsername}`,
		}),
		getUserByName: builder.query<string, string>({
			query: (name) => `users/findByName?name=${name}`,
		}),
		getProjects: builder.query<ProjectListView[], void>({
			query: () => `projects`,
		}),
		getTrackers: builder.query<TrackerListView[], string>({
			query: (projectId) => `projects/${projectId}/trackers`,
		}),
		getItems: builder.query<ItemQueryPage, CodeBeamerItemsQuery>({
			query: (parameters) => {
				return {
					url: `/items/query`,
					method: 'POST',
					body: parameters,
					headers: { 'Content-type': 'application/json' },
				};
			},
		}),
	}),
});

export const {
	useTestAuthenticationQuery,
	useGetUserByNameQuery,
	useGetProjectsQuery,
	useGetTrackersQuery,
	useGetItemsQuery,
} = codeBeamerApi;
