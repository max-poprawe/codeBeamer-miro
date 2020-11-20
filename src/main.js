var BASE_PATH = 'http://localhost:8080/cb/api/v3'
var INBOX_TRACKER_ID = 13413
var CB_HEADERS = {
  'Authorization': `Basic YWRtaW46YWRtaW4=`, // admin/admin
  'Content-Type': 'application/json'
};
var appId

const NEWPOS = "NEWPOS"
const OPEN_ITEM_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 5V17H20V14C20 13.4477 20.4477 13 21 13C21.5523 13 22 13.4477 22 14V17C22 18.1046 21.1046 19 20 19H4C2.89543 19 2 18.1046 2 17V5C2 3.89543 2.89543 3 4 3H11C11.5523 3 12 3.44772 12 4C12 4.55228 11.5523 5 11 5H4Z" fill="#050038"/><path d="M20.0093 6.40496L20 8.99643C19.998 9.54871 20.4442 9.99802 20.9964 9.99999C21.5487 10.002 21.998 9.55585 22 9.00357L22.0214 3H16C15.4477 3 15 3.44772 15 4C15 4.55228 15.4477 5 16 5H18.5858L12.2929 11.2929C11.9024 11.6834 11.9024 12.3166 12.2929 12.7071C12.6834 13.0976 13.3166 13.0976 13.7071 12.7071L20.0093 6.40496Z" fill="#050038"/><path d="M6 21C6 20.4477 6.44772 20 7 20H17C17.5523 20 18 20.4477 18 21C18 21.5523 17.5523 22 17 22H7C6.44771 22 6 21.5523 6 21Z" fill="#050038"/></svg>'
const UPLOAD_ICON = require('src/img/upload-to-codebeamer.svg')

miro.onReady(() => {
  appId = miro.getClientId()
  miro.initialize({
    extensionPoints: {
      bottomBar: {
        title: 'CodeBeamer Integration',
        svgIcon: '<circle cx="12" cy="12" r="9" fill="none" fill-rule="evenodd" stroke="currentColor" stroke-width="2"/>',
        onClick: syncWithCodeBeamer,
      },
      getWidgetMenuItems: function (selectedWidgets) {
        var menuItems = []
        if (isSelectionConvertable(selectedWidgets))
          menuItems.push(
            {
              tooltip: "Convert to codeBeamer Item",
              svgIcon: UPLOAD_ICON,
              onClick: () => submitNewCodeBeamerItem(selectedWidgets[0]),
            })
        if (isSelectionOpenable(selectedWidgets))
          menuItems.push(
            {
              tooltip: "Open in CodeBeamer",
              svgIcon: OPEN_ITEM_ICON,
              onClick: () => openInCodeBeamer(selectedWidgets),
            })
        return menuItems
      },
    }
  })
})

function isSelectionConvertable(selectedWidgets) {
  // only single selection supported
  return selectedWidgets.length === 1 && isWidgetConvertable(selectedWidgets[0])
}

function isWidgetConvertable(widget) {
  let supportedWidgetTypes = ['STICKER', 'CARD', 'TEXT', 'SHAPE']
  return (!widget.metadata || !widget.metadata[appId]) // only allow items NOT created by this plugin
    && supportedWidgetTypes.includes(widget.type) // only allow supported types
}

function isSelectionOpenable(selectedWidgets) {
  // only single selection supported
  return !selectedWidgets.some(widget => !isWidgetRepresentingCodeBeamerItem(widget))
}

function isWidgetRepresentingCodeBeamerItem(widget) {
  return widget.metadata && widget.metadata[appId] && widget.metadata[appId].id
}


async function openInCodeBeamer(selectedWidgets) {
  selectedWidgets.forEach(widget => window.open(getCodeBeamerItemURL(widget.metadata[appId].id), '_blank'))
}


async function syncWithCodeBeamer() {
  await getCodeBeamerItems()
    .then(async cbItems => {
      await Promise.all(cbItems.map(cbItem => createOrUpdateCbItem(cbItem)))
      await Promise.all(cbItems.map(cbItem => createUpdateOrDeleteAssociationLines(cbItem)))
    })
  miro.showNotification('Sync with codeBeamer finished!')
}

async function enrichBaseCbItemWithDetails(cbItem) {
  cbItem.tracker = await getCodeBeamerTrackerDetails(cbItem.tracker)
  cbItem.renderedDescription = cbItem.descriptionFormat === 'Wiki'
    ? await getCodeBeamerWiki2Html(cbItem.description, cbItem)
    : cbItem.description
  return cbItem
}

async function createOrUpdateCbItem(cbItem) {
  await enrichBaseCbItemWithDetails(cbItem)
  let cardData = convert2Card(cbItem)
  cbItem.card = await createOrUpdateWidget(cardData)
  return cbItem
}

async function createUpdateOrDeleteAssociationLines(cbItem) {
  let associations = await getCodeBeamerOutgoingAssociations(cbItem)
  const existingLines = await findLinesByFromCard(cbItem.card.id)

  // delete lines which are no longer present that originate on any of the items synched above
  let deletionTask = Promise.all(
    existingLines.map(
      async line => {
        if (!associations.find(association => line.metadata[appId].id === association.id)) {
          console.log(`deleting line ${line.id} because the association ${line.metadata[appId].id} does not exist anymore`)
          await deleteWidget(line)
        }
      }
    )
  )

  // add or update lines
  let additionTask = Promise.all(
    associations.map(
      async association => {
        const toCard = await findWidgetByTypeAndMetadataId({ type: 'CARD', metadata: { [appId]: { id: association.itemRevision.id } } });
        console.log(`Association ${association.id}: card for codeBeamer ID ${association.itemRevision.id} is: ${toCard ? toCard.id : 'NOT FOUND (item not synced)'}`)
        if (toCard) {
          let associationDetails = await getCodeBeamerAccociationDetails(association)
          await createOrUpdateWidget(convert2Line(associationDetails, cbItem.card.id, toCard.id))
        }
      }
    )
  )

  await Promise.all([deletionTask, additionTask])
}

async function submitNewCodeBeamerItem(widget) {
  // get widget with all meta data (the selected one only has the general widget properties, but is lacking the type specifcs)
  widget = await getWidgetDetail({ id: widget.id })
  // generate submission object and submit
  let submissionItem = convert2CbItem(widget)
  let cbItem = await addNewCbItem(submissionItem)
  // create new item in same position as old one
  cbItem[NEWPOS] = { x: widget.x, y: widget.y }
  deleteWidget(widget) // dont wait
  await createOrUpdateCbItem(cbItem)
  miro.board.selection.selectWidgets({ id: cbItem.card.id })
  // delete old widget

  // no need to sync associations as the item was just created. Need to change if we add ability to link from miro
}




// ------------------------ CodeBeamer ------------------------------

async function getCodeBeamerItems() {
  try {
    const cbItems = await fetch(`${BASE_PATH}/items/query?page=1&pageSize=500&queryString=tracker.id%20IN%20%2813413%29`, {
      //const cbItems = await fetch(`${BASE_PATH}/trackers/13413/items?page=1&pageSize=500`, {
      method: 'GET',
      headers: CB_HEADERS,
    })
      .then(res => res.json())
    return cbItems.items
  } catch (error) {
    console.log('Error while getting items from codeBeamer', error)
  }
}

// not needed if we use query directly (details are already there)
async function getCodeBeamerItemDetails(item) {
  return await fetch(`${BASE_PATH}/items/${item.id}`, {
    method: 'GET',
    headers: CB_HEADERS,
  })
    .then(res => res.json())
}

async function getCodeBeamerWiki2Html(markup, trackerItem) {
  let body = {
    contextId: trackerItem.id,
    contextVersion: trackerItem.version,
    renderingContextType: "TRACKER_ITEM",
    markup: markup
  }
  return await fetch(`${BASE_PATH}/projects/${trackerItem.tracker.project.id}/wiki2html`, {
    method: 'POST',
    headers: CB_HEADERS,
    body: JSON.stringify(body),
  })
    .then(res => res.text())
}

async function getCodeBeamerTrackerDetails(tracker) {
  return await fetch(`${BASE_PATH}/trackers/${tracker.id}`, {
    method: 'GET',
    headers: CB_HEADERS,
  })
    .then(res => res.json())
}

async function getCodeBeamerOutgoingAssociations(item) {
  const itemRelations = await fetch(`${BASE_PATH}/items/${item.id}/relations`, {
    method: 'GET',
    headers: CB_HEADERS,
  })
    .then(res => res.json())
  return itemRelations.outgoingAssociations
}

async function getCodeBeamerAccociationDetails(association) {
  return await fetch(`${BASE_PATH}/associations/${association.id}`, {
    method: 'GET',
    headers: CB_HEADERS,
  })
    .then(res => res.json())
}

async function addNewCbItem(item) {
  return await fetch(`${BASE_PATH}/trackers/${INBOX_TRACKER_ID}/items`, {
    method: 'POST',
    headers: CB_HEADERS,
    body: JSON.stringify(item),
  })
    .then(res => res.json())
}

function getCodeBeamerItemURL(id) {
  return `http://localhost:8080/cb/issue/${id}`
}

// ------------------------------------------------------------------


// ------------------------ Converter ------------------------------

function findColorFieldOnItem(item) {
  var colorField = item.customFields ? item.customFields.find(field => field.type === 'ColorFieldValue') : null
  return colorField ? colorField.value : null
}

function convert2Card(item) {
  let cardData = {
    type: 'CARD',
    title: `<a href="${getCodeBeamerItemURL(item.id)}">[${item.tracker.keyName}-${item.id}] - ${item.name}</a>`,
    description: item.renderedDescription,
    card: {
      logo: {
        iconUrl: `${window.location.href}src/img/codeBeamer-Logo-BW.png`
      },
      customFields: [
        {
          mainColor: '#4f8ae8', // light blue
          fontColor: '#ffffff', // white
          value: `Status: ${item.status.name}`,
        }, {
          value: `Release: ${item.release ? item.release.name : '--'}`
        },
      ],
    },
    capabilities: {
      editable: false
    },
    metadata: {
      [appId]: {
        id: item.id,
      },
    },
  }

  // background Color
  let colorFieldValue = findColorFieldOnItem(item)
  let backgroundColor = colorFieldValue ? colorFieldValue
    : item.tracker.color ? item.tracker.color
      : null
  if (backgroundColor) {
    cardData.style = { backgroundColor: backgroundColor }
  }

  if (item[NEWPOS]) {
    cardData.x = item[NEWPOS].x
    cardData.y = item[NEWPOS].y
  }

  return cardData
}

function lineStyleByAssociationType(associationDetails) {
  let style = {
    lineType: 2, // ARROW: = 2, ARROW_SKETCH: = 9, LINE: = 1
    lineStyle: 2, // DASHED = 1, NORMAL = 2, STRONG = 3, DOTTED = 4
    lineEndStyle: 1, // ARC_ARROW: = 1, ARROW: = 6, CIRCLE: = 4, FILLED_ARROW: = 8, FILLED_CIRCLE: = 5, FILLED_RHOMBUS: = 3, NONE: = 0, OPEN_ARROW: = 7, RHOMBUS: = 2
    lineStartStyle: 0, // see above
    lineThickness: 1,
  }

  switch (associationDetails.type.id) {
    case 1: // depends
      style.lineColor = '#cf7f30' // orange
      style.lineEndStyle = 6
      lineThickness = 5
      break;
    case 4: // related
    case 9: // copy of
      style.lineColor = '#21cfb7' // turquise
      style.lineStyle = 1
      style.lineStartStyle = 1
      break;
    case 6: // violates
    case 8: // invalidates
    case 7: // excludes
      style.lineColor = '#b32525' // red
      break;
    case 2: // parent
    case 3: // child
    case 5: // derived
    default:
    // leave default
  }
  return style
}

function convert2Line(associationDetails, fromCardId, toCardId) {
  let lineData = {
    type: 'LINE',
    startWidgetId: fromCardId,
    endWidgetId: toCardId,
    style: lineStyleByAssociationType(associationDetails),
    capabilities: {
      editable: false
    },
    metadata: {
      [appId]: {
        id: associationDetails.id,
      },
    },
  }
  return lineData
}

function strip(html) {
  let doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent;
}

function convert2CbItem(widget) {
  let item = {
    name: "New Item",
    description: "--"
  }
  switch (widget.type) {
    case 'CARD':
      nameNoHtml = strip(widget.title)
      if (nameNoHtml)
        item.name = nameNoHtml
      if (widget.description)
        item.description = widget.description
      break;
    case 'SHAPE':
    case 'STICKER':
      if (widget.plainText)
        item.name = widget.plainText
      break;
    case 'TEXT':
      if (widget.text)
        item.name = widget.text
      break;
    default:
      throw `Widget type '${widget.type}' not supported`
  }
  return item
}

// ------------------------------------------------------------------



// ------------------------ Miro ------------------------------

async function getWidgetDetail(widget) {
  return (await miro.board.widgets.get(widget))[0]
}

async function findWidgetByTypeAndMetadataId(widgetData) {
  return (
    (await miro.board.widgets.get({
      type: widgetData.type,
    })))
    .filter((widget) => !!widget.metadata[this.appId])
    .find((widget) => widget.metadata[this.appId].id === widgetData.metadata[this.appId].id)
}

async function findLinesByFromCard(fromCardId) {
  return (
    (await miro.board.widgets.get({
      type: 'LINE',
    })))
    .filter((line) => line.metadata[this.appId] && line.startWidgetId === fromCardId)
}

async function createOrUpdateWidget(widgetData) {
  const existingWidget = await this.findWidgetByTypeAndMetadataId(widgetData);
  if (existingWidget) {
    widgetData.id = existingWidget.id
    return await this.updateWidget(widgetData)
  } else {
    return await this.createWidget(widgetData)
  }
}

async function createWidget(widgetData) {
  let widget = (await miro.board.widgets.create(widgetData))[0]
  console.log(`${widget.type} widget ${widget.id} has been created to match item ${widget.metadata[this.appId].id}`)
  return widget
}

async function updateWidget(widgetData) {
  let widget = (await miro.board.widgets.update(widgetData))[0]
  console.log(`${widget.type} widget ${widget.id} has been updated to match item ${widget.metadata[this.appId].id}`)
  return widget
}

async function deleteWidget(widgetData) {
  return await miro.board.widgets.deleteById(widgetData)
}


// -----------------------------------------------------------------