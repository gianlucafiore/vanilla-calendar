/*jshint esversion: 8 */

const Field = require("@saltcorn/data/models/field");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const {
  stateFieldsToWhere,
  readState,
} = require("@saltcorn/data/plugin-helper");
const {
  eval_expression,
  jsexprToWhere,
} = require("@saltcorn/data/models/expression");
const { mergeIntoWhere } = require("@saltcorn/data/utils");

const {
  text,
  div,
  h3,
  style,
  a,
  script,
  pre,
  domReady,
  i,
  code,
} = require("@saltcorn/markup/tags");

const { features } = require("@saltcorn/data/db/state");
const public_user_role = features?.public_user_role || 10;

const getColorOptions = async (fields) => {
  const result = [];
  for (const field of fields) {
    if (field.type.name === "Color") result.push(field.name);
    else if (field.is_fkey) {
      const reftable = Table.findOne({
        name: field.reftable_name,
      });
      const reffields = await reftable.getFields();
      reffields
        .filter((f) => f.type.name === "Color")
        .forEach((f) => result.push(`${field.name}.${f.name}`));
    }
  }
  return result;
};
const configuration_workflow = (req) =>
  new Workflow({
    steps: [
      {
        name: "Event Configuration",
        blurb: "Attributes of the events to be displayed on the calendar.",
        form: async (context) => {
          const table = await Table.findOne({ id: context.table_id });
          const fields = await table.getFields();

          const expand_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewtemplate, viewrow }) =>
              viewrow.name !== context.viewname
          );
          const expand_view_opts = expand_views.map((v) => v.name);

          const create_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewrow }) =>
              viewrow.name !== context.viewname &&
              state_fields.every((sf) => !sf.required)
          );
          const create_view_opts = create_views.map((v) => v.name);

          const event_views = await View.find_table_views_where(
            context.table_id,
            ({ viewtemplate, viewrow }) =>
              viewrow.name !== context.viewname &&
              viewtemplate?.name !== "Calendar" &&
              viewtemplate?.name !== "Edit"
          );
          const event_views_opts = event_views.map((v) => v.name);

          return new Form({
            fields: [
              {
                name: "title_field",
                label: "Event title field",
                type: "String",
                sublabel:
                  "A string for the event name displayed on the calendar.",
                required: true,
                attributes: {
                  options: fields
                    .filter((f) => f.type.name === "String")
                    .map((f) => f.name)
                    .join(),
                },
              },
              {
                name: "start_field",
                label: "Start field",
                type: "String",
                sublabel: "A date field for when the event starts.",
                required: true,
                attributes: {
                  options: fields
                    .filter((f) => f.type.name === "Date")
                    .map((f) => f.name)
                    .join(),
                },
              },
              {
                name: "end_field",
                label: "End field",
                type: "String",
                sublabel: "A date field for when the event ends.",
                required: false,
                attributes: {
                  options: fields
                    .filter((f) => f.type.name === "Date")
                    .map((f) => f.name)
                    .join(),
                },
                showIf: { switch_to_duration: false },
              },
              {
                name: "duration_field",
                label: "Duration",
                type: "String",
                sublabel:
                  "An 'Int' or 'Float' field for the duration of the event.",
                required: false,
                attributes: {
                  options: fields
                    .filter(
                      (f) =>
                        f.name !== "id" &&
                        (f.type.name === "Integer" || f.type.name === "Float")
                    )
                    .map((f) => f.name)
                    .join(),
                },
                showIf: { switch_to_duration: true },
              },
              {
                name: "duration_units",
                label: "Duration units",
                type: "String",
                sublabel: "Units of duration field",
                required: false,
                attributes: {
                  options: "Seconds,Minutes,Hours,Days",
                },
                showIf: { switch_to_duration: true },
              },
              {
                name: "switch_to_duration",
                label: "Use duration instead",
                sublabel: "Use an event duration instead of an end date",
                type: "Bool",
                required: true,
              },
              {
                name: "allday_field",
                type: "String",
                label: "All-day field",
                sublabel:
                  "Boolean field to specify whether this is an all-day event.",
                required: false,
                attributes: {
                  options: [
                    ...fields
                      .filter((f) => f.type.name === "Bool")
                      .map((f) => f.name),
                    "Always",
                  ].join(),
                },
              },
              {
                name: "event_color",
                type: "String",
                label: "Event Color",
                sublabel: "A 'Color' field to set the color of this event.",
                required: false,
                attributes: {
                  options: await getColorOptions(fields),
                },
              },
              {
                name: "include_fml",
                label: req.__("Row inclusion formula"),
                class: "validate-expression",
                sublabel:
                  req.__("Only include rows where this formula is true. ") +
                  req.__("In scope:") +
                  " " +
                  [
                    ...fields.map((f) => f.name),
                    "user",
                    "year",
                    "month",
                    "day",
                    "today()",
                  ]
                    .map((s) => code(s))
                    .join(", "),
                type: "String",
              },
              {
                name: "expand_view",
                label: "Expand View",
                sublabel:
                  "The view that opens when the user clicks on an event.",
                type: "String",
                required: false,
                attributes: {
                  options: expand_view_opts.join(),
                },
              },
              {
                name: "expand_display_mode",
                label: "Expand display mode",
                sublabel: "Open the 'expand view' via a link or a pop-up.",
                type: "String",
                attributes: {
                  options: ["link", "pop-up"],
                },
                required: true,
                default: "link",
                showIf: { expand_view: expand_view_opts },
              },
              {
                name: "reload_on_edit_in_pop_up",
                label: "Reload on edit",
                sublabel:
                  "After editing an event in a pop-up, reload the page. " +
                  "Otherwise, it updates only the calendar.",
                type: "Bool",
                default: false,
                showIf: {
                  expand_display_mode: "pop-up",
                },
              },
              {
                name: "view_to_create",
                label: "Use view to create",
                sublabel:
                  "View to create a new event. Leave blank to have no link to create a new item",
                type: "String",
                attributes: {
                  options: create_view_opts.join(),
                },
              },
              {
                name: "create_display_mode",
                label: "Create display mode",
                sublabel: "Open the 'create view' via a link or a pop-up.",
                type: "String",
                attributes: {
                  options: ["link", "pop-up"],
                },
                required: true,
                default: "link",
                showIf: { view_to_create: create_view_opts },
              },
              {
                name: "event_view",
                label: "Event view",
                sublabel:
                  "This view will be drawn on top of events instead of the default title. " +
                  "Please use a small view, preferably only with rudimental display elements. " +
                  "Overflows won't be shown.",
                type: "String",
                required: false,
                attributes: {
                  options: event_views_opts.join(),
                },
              },
              {
                name: "reload_on_drag_resize",
                label: "Reload on drag / resize",
                sublabel:
                  "After dropping or resizing an event, reload the page. " +
                  "Otherwise, it updates only the calendar.",
                type: "Bool",
                default: false,
              },
            ],
          });
        },
      },
    ],
  });

const get_state_fields = async (table_id, viewname, { show_view }) => {
  const table = Table.findOne(table_id);
  const table_fields = await table.getFields();
  return table_fields.map((f) => {
    const sf = new Field(f);
    sf.required = false;
    return sf;
  });
};


const run = async (
  table_id,
  viewname,
  {
    view_to_create,
    expand_view,
    start_field,
    allday_field,
    end_field,
    duration_units,
    duration_field,
    switch_to_duration,
    title_field,
    nowIndicator,
    weekNumbers,
    initialView,
    default_event_color,
    calendar_view_options,
    custom_calendar_views,
    event_color,
    limit_to_working_days,
    min_week_view_time,
    max_week_view_time,
    expand_display_mode,
    create_display_mode,
    reload_on_edit_in_pop_up,
    event_view,
    reload_on_drag_resize,
    include_fml,
    caldav_url,
    ...rest
  },
  state,
  extraArgs
) => {
  const table = await Table.findOne({ id: table_id });
  const fields = await table.getFields();
  readState(state, fields);
  const where = await stateFieldsToWhere({ fields, state });
  if (include_fml) {
    const ctx = {
      ...state,
      user_id: extraArgs.req.user?.id || null,
      user: extraArgs.req.user,
    };
    let where1 = jsexprToWhere(include_fml, ctx, fields);
    mergeIntoWhere(where, where1 || {});
  }
  const rows = await table.getJoinedRows({
    where,
    joinFields: buildJoinFields(event_color),
  });
  const otherCalendars = (await View.find({ viewtemplate: "Calendar" })).filter(
    (view) => view.name !== viewname && rest[view.name]
  );
  const id = `cal${Math.round(Math.random() * 100000)}`;
  const weekends = limit_to_working_days ? false : true; // fullcalendar flag to filter out weekends
  // parse min/max times or use defaults
  const minAsDate = new Date(`1970-01-01T${min_week_view_time}`);
  const maxAsDate = new Date(`1970-01-01T${max_week_view_time}`);
  const minIsValid = isValidDate(minAsDate);
  const minTime = minIsValid ? minAsDate.toTimeString() : "00:00:00";
  const maxIsValid = isValidDate(maxAsDate);
  const maxTime = maxIsValid ? maxAsDate.toTimeString() : "24:00:00";
  const alwaysAllDay = allday_field === "Always";
  const transferedState = buildTransferedState(fields, state);
  const excluded = [start_field];
  if (end_field) excluded.push(end_field);
  const transferedSelectState = buildTransferedState(fields, state, excluded);
  const eventView = event_view
    ? await View.findOne({ name: event_view })
    : undefined;
  const events = await Promise.all(
    rows.map((row) =>
      eventFromRow(
        row,
        table_id,
        alwaysAllDay,
        transferedState,
        eventView,
        extraArgs.req,
        {
          expand_view,
          start_field,
          allday_field,
          end_field,
          duration_field,
          duration_units,
          switch_to_duration,
          title_field,
          event_color,
        }
      )
    )
  );
  await addOtherCalendars(
    events,
    otherCalendars,
    extraArgs.req,
    state,
    transferedState
  );
  return (
    div(
      script(
        domReady(`
           const { Calendar } = window.VanillaCalendarPro;
        // Create a calendar instance and initialize it.
        const calendar = new Calendar('${id}');
        calendar.init();
          `)
      ),
      div({ id })
    )
  );
};
/*
 * internal helper to build a response with the updated event
 */
const buildResponse = async (
  table,
  rowId,
  req,
  {
    expand_view,
    start_field,
    allday_field,
    end_field,
    duration_field,
    duration_units,
    switch_to_duration,
    title_field,
    event_color,
    event_view,
  }
) => {
  const updatedRow = await table.getJoinedRows({
    where: { id: rowId },
    joinFields: buildJoinFields(event_color),
  });
  const eventView = event_view
    ? await View.findOne({ name: event_view })
    : undefined;
  return {
    json: {
      newEvent: await eventFromRow(
        updatedRow[0],
        table.id,
        allday_field === "Always",
        undefined,
        eventView,
        req,
        {
          expand_view,
          start_field,
          allday_field,
          end_field,
          duration_field,
          duration_units,
          switch_to_duration,
          title_field,
          event_color,
        }
      ),
    },
  };
};

/*
 * service to load a calendar event from the db
 */
const load_calendar_event = async (
  unusedTableID, // use tableId for multi table support
  viewname,
  config,
  { rowId, tableId },
  { req }
) => {
  const table = await Table.findOne({ id: tableId });
  const role = req.isAuthenticated() ? req.user.role_id : public_user_role;
  if (role > table.min_role_write) {
    return { json: { error: req.__("Not authorized") } };
  }
  return await buildResponse(table, rowId, req, config);
};
/*
 * service to update a calendar event in the db
 */
const update_calendar_event = async (
  unusedTableID, // use tableId for multi table support
  viewname,
  {
    start_field,
    end_field,
    duration_units,
    duration_field,
    switch_to_duration,
    allday_field,
    expand_view,
    title_field,
    event_color,
    event_view,
  },
  { rowId, tableId, delta, allDay, start, end },
  { req }
) => {
  const table = await Table.findOne({ id: tableId });
  const role = req.isAuthenticated() ? req.user.role_id : public_user_role;
  if (role > table.min_role_write) {
    return { json: { error: req.__("Not authorized") } };
  }
  const fields = await table.getFields();
  if (
    switch_to_duration &&
    duration_field &&
    fields &&
    !fields.find((field) => field.name === duration_field)
  ) {
    return { json: { error: req.__("The duration column does not exist.") } };
  }
  const row = await table.getRow({ id: rowId });
  let updateVals = {};
  let allDayChanged = false;
  if (
    allday_field &&
    allday_field !== "Always" &&
    allDay !== undefined &&
    row[allday_field] !== allDay
  ) {
    updateVals[allday_field] = allDay;
    allDayChanged = true;
  }
  const startAsDate = start ? new Date(start) : null;
  if (
    isValidDate(startAsDate) &&
    startAsDate.getTime() !== row[start_field].getTime()
  )
    updateVals[start_field] = startAsDate;
  const endAsDate = end ? new Date(end) : null;
  if (switch_to_duration) {
    const isFloat = duration_field && durationIsFloat(fields, duration_field);
    if (isValidDate(endAsDate) && isValidDate(startAsDate)) {
      const unitSecs = unitSeconds(duration_units);
      const floatDuration = (endAsDate - startAsDate) / 1000 / unitSecs;
      const newDuration = isFloat ? floatDuration : Math.trunc(floatDuration);
      const oldDuration = row[duration_field];
      if (
        (!isFloat && newDuration !== oldDuration) ||
        (isFloat && Math.abs(newDuration - oldDuration) > Number.EPSILON)
      )
        updateVals[duration_field] = newDuration;
    }
  } else if (end_field && isValidDate(endAsDate)) {
    updateVals[end_field] = endAsDate;
  } else if (end_field && allDayChanged && !isEmptyDelta(delta)) {
    updateVals[end_field] = applyDelta(row[end_field], delta);
  }
  if (Object.keys(updateVals).length !== 0)
    await table.updateRow(updateVals, rowId, req.user);
  return await buildResponse(table, rowId, req, {
    expand_view,
    start_field,
    allday_field,
    end_field,
    duration_field,
    duration_units,
    switch_to_duration,
    title_field,
    event_color,
    event_view,
  });
};
const headers = [ 
  {
    script: "/plugins/public/fullcalendar/main.min.js",
  },
  {
    script: "https://cdn.jsdelivr.net/npm/vanilla-calendar-pro/index.js",
  },
  {
    css: "https://cdn.jsdelivr.net/npm/vanilla-calendar-pro/styles/index.css",
  },
];
const connectedObjects = async ({
  viewname,
  expand_view,
  expand_display_mode,
  view_to_create,
  create_display_mode,
  ...rest
}) => {
  let result = { embeddedViews: [], linkedViews: [], tables: [] };
  const addWithMode = (viewName, mode) => {
    const view = View.findOne({ name: viewName });
    if (view) {
      switch (mode) {
        case "link":
          result.linkedViews.push(view);
          break;
        case "pop-up":
          result.embeddedViews.push(view);
          break;
      }
    }
  };
  const handleCalendarCfg = (configuration) => {
    if (configuration.expand_view)
      addWithMode(configuration.expand_view, configuration.expand_display_mode);
    if (configuration.view_to_create)
      addWithMode(
        configuration.view_to_create,
        configuration.create_display_mode
      );
  };
  handleCalendarCfg({
    expand_view,
    expand_display_mode,
    view_to_create,
    create_display_mode,
  });
  const otherCalendars = (await View.find({ viewtemplate: "Calendar" })).filter(
    (view) => view.name !== viewname && rest[view.name]
  );
  for (const otherCalendar of otherCalendars) {
    if (otherCalendar.configuration)
      handleCalendarCfg(otherCalendar.configuration);
    const otherTable = Table.findOne({ id: otherCalendar.table_id });
    if (otherTable) result.tables.push(otherTable);
  }
  return result;
};
module.exports = {
  sc_plugin_api_version: 1,
  headers,
  plugin_name: "fullcalendar",
  viewtemplates: [
    {
      name: "Vanilla-Calendar",
      description:
        "Displays items on a calendar, with multi options for month, years, and others.",
      display_state_form: false,
      get_state_fields,
      configuration_workflow,
      run,
      routes: { update_calendar_event, load_calendar_event },
      connectedObjects,
    },
  ],
};
