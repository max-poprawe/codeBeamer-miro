import * as React from 'react';
import ItemActions from './ItemActions';

const mockItemId = 201284;

describe('<ItemActions>', () => {
	it('mounts', () => {
		cy.mountWithStore(<ItemActions itemId={mockItemId} cardId={''} />);
	});

	describe('association-visualization', () => {
		context('button', () => {

			it('displays a button to visualize associations', () => {
				cy.mountWithStore(<ItemActions itemId={mockItemId} cardId={''} />);
				cy.getBySel('show-dependency').should('exist');
			});
			
			it.only('displays the number of outgoing relations the item has in the button', () => {
				cy.intercept(`**/items/${mockItemId}/relations`, {
					fixture: 'itemRelations.json',
				}).as('relations');

				cy.mountWithStore(<ItemActions itemId={mockItemId} cardId={''} />);
				cy.wait('@relations');

				cy.fixture('itemRelations.json').then((relations) => {
					cy.getBySel('load-downstream-references').should(
						'contain.text',
						`(${relations.downstreamReferences.length})`
					);
				});
			});

			it('is initially disabled by default', () => {
				cy.mountWithStore(<ItemActions itemId={mockItemId} cardId={''} />);
				cy.getBySel('show-dependency').should('be.disabled');
			});
			
			it('is clickable only when there are outgoing relations', () => {
				cy.intercept(`**/items/${mockItemId}/relations`, {
					fixture: 'itemRelations.json',
				}).as('relations');
				cy.mountWithStore(<ItemActions itemId={mockItemId} cardId={''} />);
				cy.wait('@relations');

				cy.stub(miro.board, 'get').returns(Promise.resolve([
					{
						"title": "<a href=\"https://retinatest.roche.com/cb/issue/783345\">mock item - [mst|783345]</a>",
						"id": "1111"
					}
				]));

				cy.getBySel('show-dependency').should('be.enabled');
			});


			it('prompts the creation of connectors for all outgoing relations of the item', () => {
				
			});
		});
	});

	describe('load-downstream-refs', () => {
		beforeEach(() => {});

		it('eagerly loads the item its relations', () => {
			cy.intercept(`**/items/${mockItemId}/relations`, {
				fixture: 'itemRelations.json',
			}).as('relations');

			cy.mountWithStore(<ItemActions itemId={mockItemId} cardId={''} />);

			cy.wait('@relations');
		});

		describe('button', () => {
			it('displays a button to load downstream references with', () => {
				cy.intercept(`**/items/${mockItemId}/relations`, {
					fixture: 'itemRelations.json',
				}).as('relations');

				cy.mountWithStore(<ItemActions itemId={mockItemId} cardId={''} />);
				cy.wait('@relations');

				cy.getBySel('load-downstream-references').should('exist');
			});

			it('displays the number of downstream references the item has in the button', () => {
				cy.intercept(`**/items/${mockItemId}/relations`, {
					fixture: 'itemRelations.json',
				}).as('relations');

				cy.mountWithStore(<ItemActions itemId={mockItemId} cardId={''} />);
				cy.wait('@relations');

				cy.fixture('itemRelations.json').then((relations) => {
					cy.getBySel('load-downstream-references').should(
						'contain.text',
						`(${relations.downstreamReferences.length})`
					);
				});
			});

			it('disables the button while fetching the relations data', () => {
				cy.intercept(`**/items/${mockItemId}/relations`, {
					fixture: 'itemRelations.json',
					delay: 500,
				}).as('relations');

				cy.mountWithStore(<ItemActions itemId={mockItemId} cardId={''} />);

				cy.getBySel('load-downstream-references').should(
					'have.attr',
					'disabled'
				);
				cy.wait('@relations');
				cy.getBySel('load-downstream-references').should(
					'not.have.attr',
					'disabled'
				);
			});

			it('prompts the Import of all the Item its downstream references when clicked', () => {
				cy.intercept(`**/items/${mockItemId}/relations`, {
					fixture: 'itemRelations.json',
					delay: 500,
				}).as('relations');
				cy.intercept(`**/items/query`, {
					fixture: 'query_multi-page.json',
				}).as('query');

				cy.mountWithStore(<ItemActions itemId={mockItemId} cardId={''} />);

				cy.wait('@relations');

				cy.getBySel('load-downstream-references').click();
				cy.getBySel('importProgress').should('exist');

				cy.fixture('itemRelations.json').then((relations) => {
					const queryString = `item.id IN (${relations.downstreamReferences.map(
						(d: {
							id: number;
							itemRevision: { id: number; version: number };
							type: string;
						}) => d.itemRevision.id.toString()
					)})`;
					cy.wait('@query')
						.its('request.body.queryString')
						.should('equal', queryString);
				});
			});
		});
	});
});
