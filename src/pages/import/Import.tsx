import * as React from 'react';
import ImportHeader from './components/importHeader/ImportHeader';
import Query from './components/query/Query';
import QueryResults from './components/queryResults/QueryResults';

import './import.css';

export default function Import() {
	return (
		<>
			<ImportHeader />
			<Query />
			<QueryResults />
		</>
	);
}
