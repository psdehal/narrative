/*global define*/
/*jslint white:true,browser:true*/
define([
    'jquery',
    'bluebird',
    'handlebars',
    'kb_common/html',
    'kb_service/client/workspace',
    'common/validation',
    'common/events',
    'common/runtime',
    'common/dom',
    'common/props',
    'bootstrap',
    'css!font-awesome'
], function (
    $,
    Promise,
    Handlebars,
    html,
    Workspace,
    Validation,
    Events,
    Runtime,
    Dom,
    Props
    ) {
    'use strict';

    /*
     * spec
     *   textsubdata_options
     *     allow_custom: 0/1
     *     multiselection: 0/1
     *     placholder: text
     *     show_src_obj: 0/1
     *     subdata_selection:
     *       parameter_id: string
     *       path_to_subdata: array<string>
     *       selection_id: string
     *       subdata_included: array<string>
     *
     */

    // Constants
    var t = html.tag,
        div = t('div'), p = t('p'), span = t('span'),
        select = t('select'), input = t('input'),
        table = t('table'), tr = t('tr'), td = t('td'),
        option = t('option'), button = t('button');

    function factory(config) {
        var options = {},
            spec = config.parameterSpec,
            subdataOptions = spec.spec.textsubdata_options,
            parent,
            container,
            $container,
            workspaceId = config.workspaceId,
            subdata = spec.textsubdata_options,
            bus = config.bus,
            runCount = 0,
            model,
            //model = {
            //    referenceObjectName: null,
            //    availableValues: null,
            //    value: null
            //},
            options = {
                objectSelectionPageSize: 20
            },
        runtime = Runtime.make(),
            dom;

        // Validate configuration.
        if (!workspaceId) {
            throw new Error('Workspace id required for the object widget');
        }
        //if (!workspaceUrl) {
        //    throw new Error('Workspace url is required for the object widget');
        //}

        options.enabled = true;

        function buildOptions() {
            var availableValues = model.getItem('availableValues'),
                value = model.getItem('value') || [],
                selectOptions = [option({value: ''}, '')];
            if (!availableValues) {
                return selectOptions;
            }
            return selectOptions.concat(availableValues.map(function (availableValue) {
                var selected = false,
                    optionLabel = availableValue.id,
                    optionValue = availableValue.id;
                // TODO: pull the value out of the object
                if (value.indexOf(availableValue.id) >= 0) {
                    selected = true;
                }
                return option({
                    value: optionValue,
                    selected: selected
                }, optionLabel);
            }));
        }

        function buildCount() {
            var availableValues = model.getItem('availableValues') || [],
                value = model.getItem('value') || [];

            return String(value.length) + ' / ' + String(availableValues.length) + ' items';
        }

        function filterItems(items, filter) {
            if (!filter) {
                return items;
            }
            var re = new RegExp(filter);
            return items.filter(function (item) {
                if (item.label.match(re, 'i')) {
                    return true;
                }
                return false;
            });
        }

        function doFilterItems() {
            var items = model.getItem('availableValues', []),
                filteredItems = filterItems(items, model.getItem('filter'));
            
            
            // for now we just reset the from/to range to the beginning.
            model.setItem('filteredAvailableItems', filteredItems);
            
            doFirstPage();
        }

        function didChange() {
            validate()
                .then(function (result) {
                    if (result.isValid) {
                        model.setItem('value', result.value);
                        updateInputControl('value');
                        bus.emit('changed', {
                            newValue: result.value
                        });
                    } else if (result.diagnosis === 'required-missing') {
                        model.setItem('value', result.value);
                        updateInputControl('value');
                        bus.emit('changed', {
                            newValue: result.value
                        });
                    }
                    bus.emit('validation', {
                        errorMessage: result.errorMessage,
                        diagnosis: result.diagnosis
                    });
                });
        }

        function doAddItem(item) {
            var selectedItems = model.getItem('selectedItems');
            if (!selectedItems) {
                selectedItems = [];
            }
            selectedItems.push(item);
            model.setItem('selectedItems', selectedItems);
            didChange();
        }

        function doRemoveSelectedItem(indexOfitemToRemove) {
            var selectedItems = model.getItem('selectedItems');
//                newSelectedItems = selectedItems.filter(function (selectedItem) {
//                    return (selectedItem.id !== itemToRemove);
//                });
                
            delete selectedItems[indexOfitemToRemove];

            model.setItem('selectedItems', selectedItems);
            didChange();
        }

        function renderAvailableItems(events) {
            var items = model.getItem('filteredAvailableItems', []),
                from = model.getItem('showFrom'),
                to = model.getItem('showTo'),
                itemsToShow = items.slice(from, to),
                content = itemsToShow.map(function (item, index) {
                    return div({style: {border: '1px green dashed'}}, [
                        table({style: {width: '100%'}}, tr([
                            td({style: {width: '10px', padding: '2px', backgroundColor: 'gray', color: 'white'}}, String(from + index + 1)),
                            td({style: {whiteSpace: 'normal'}}, item.label),
                            td({style: {width: '40px'}}, [
                                button({
                                    class: 'btn btn-default',
                                    type: 'button',
                                    dataItemId: item.id,
                                    id: events.addEvent({
                                        type: 'click',
                                        handler: function () {
                                            doAddItem(item);
                                        }
                                    })}, '&gt;')
                            ])
                        ]))
                    ]);
                })
                .join('\n');

            dom.setContent('available-items-count', String(items.length));
            dom.setContent('available-items', content);
            dom.setContent('filtered-items-count', items.length);
        }

        function renderSelectedItems(events) {
            var selectedItems = model.getItem('selectedItems') || [],
                content = selectedItems.map(function (item, index) {
                    return div({style: {border: '1px blue dashed'}}, [
                        table({style: {width: '100%'}}, tr([
                            td({style: {width: '40px'}}, [
                                button({
                                    class: 'btn btn-default',
                                    type: 'button',
                                    id: events.addEvent({
                                        type: 'click',
                                        handler: function () {
                                            doRemoveSelectedItem(index);
                                        }
                                    })
                                }, '&lt;')
                            ]),
                            td(item.label)
                        ]))
                    ]);
                }).join('\n');
            dom.setContent('selected-items', content);
        }

        function setPageStart(newFrom) {
            var from = model.getItem('showFrom'),
                to = model.getItem('to'),
                newTo,
                total = model.getItem('filteredAvailableItems', []).length,
                pageSize = 5;

            if (newFrom <= 0) {
                newFrom = 0;
            } else if (newFrom >= total) {
                newFrom = total - pageSize;
                if (newFrom < 0) {
                    newFrom = 0;
                }
            }

            if (newFrom !== from) {
                model.setItem('showFrom', newFrom);
            }

            newTo = newFrom + pageSize;
            if (newTo >= total) {
                newTo = total;
            }
            if (newTo !== to) {
                model.setItem('showTo', newTo);
            }
        }

        function movePageStart(diff) {
            setPageStart(model.getItem('showFrom') + diff);
        }

        function doPreviousPage() {
            movePageStart(-5);
        }
        function doNextPage() {
            movePageStart(5);
        }
        function doFirstPage() {
            setPageStart(0);
        }
        function doLastPage() {
            setPageStart(model.getItem('filteredAvailableItems').length);
        }
        function doSearchKeyUp(e) {
            if (e.target.value.length > 2) {
                model.setItem('filter', e.target.value);
                doFilterItems();
            } else {
                if (model.getItem('filter')) {
                    model.setItem('filter', null);
                    doFilterItems();
                }
            }
        }

        function makeInputControl(events, bus) {
            // There is an input control, and a dropdown,
            // TODO select2 after we get a handle on this...
            var selectOptions,
                size = 1,
                multiple = false,
                availableValues = model.getItem('availableValues'),
                value = model.getItem('value') || [];

            if (subdataOptions.multiselection) {
                size = 10;
                multiple = true;
            }
            if (!availableValues) {
                return p({class: 'form-control-static', style: {fontStyle: 'italic', whiteSpace: 'normal', padding: '3px', border: '1px silver solid'}}, 'Items will be available after selecting a value for ' + subdataOptions.subdata_selection.parameter_id);
            }
            //if (availableValues.length === 0) {
            //    return 'No items found';
            //}

            selectOptions = buildOptions();

            return div([
                div({class: 'row'}, [
                    div({class: 'col-md-6'}, [
                        'Available Features'
                    ]),
                    div({class: 'col-md-6'}, [
                        'Selected'
                    ])
                ]),
                div({class: 'row'}, [
                    div({class: 'col-md-3'}, [
                        div({class: ''}, [
                            input({
                                class: 'form-contol',
                                style: {width: '100%'},
                                placeholder: 'search',
                                value: model.getItem('filter') || '',
                                id: events.addEvent({
                                    type: 'keyup',
                                    handler: function (e) {
                                        doSearchKeyUp(e);
                                    }
                                })
                            })
                        ])
                    ]),
                    div({class: 'col-md-3', style: {textAlign: 'center'}}, [
                        span({dataElement: 'filtered-items-count'}), ' filtered, ',
                        span({dataElement: 'available-items-count'}), ' elements'
                    ]),
                    div({class: 'col-md-6'}, [
                    ])
                ]),
                div({class: 'row'}, [
                    div({class: 'col-md-6'}, [
                        div([
                            button({
                                type: 'button',
                                class: 'btn btn-default',
                                style: {xwidth: '100%'},
                                id: events.addEvent({
                                    type: 'click',
                                    handler: function () {
                                        doFirstPage();
                                    }
                                })
                            }, 'top'),
                            button({
                                class: 'btn btn-default',
                                type: 'button',
                                style: {xwidth: '50%'},
                                id: events.addEvent({
                                    type: 'click',
                                    handler: function () {
                                        doPreviousPage();
                                    }
                                })
                            }, '^'),
                            button({
                                class: 'btn btn-default',
                                type: 'button',
                                style: {xwidth: '100%'},
                                id: events.addEvent({
                                    type: 'click',
                                    handler: function () {
                                        doNextPage();
                                    }
                                })
                            }, 'v'),
                            button({
                                type: 'button',
                                class: 'btn btn-default',
                                style: {xwidth: '100%'},
                                id: events.addEvent({
                                    type: 'click',
                                    handler: function () {
                                        doLastPage();
                                    }
                                })
                            }, 'bottom')
                        ]),
                    ]),
                    div({class: 'col-md-6'}, [
                    ])
                ]),
                div({class: 'row'}, [
                    div({class: 'col-md-6'}, [
                        div({style: {border: '1px red solid', xheight: '100px'}, dataElement: 'available-items'})
                    ]),
                    div({class: 'col-md-6'}, [
                        div({
                            style: {
                                border: '1px red solid', xheight: '100px'
                            },
                            dataElement: 'selected-items'
                        })
                    ])
                ])
            ]);

            // CONTROL
            return div({style: {border: '1px silver solid'}}, [
                div({style: {fontStyle: 'italic'}, dataElement: 'count'}, buildCount()),
                select({
                    id: events.addEvent({
                        type: 'change',
                        handler: function (e) {
                            validate()
                                .then(function (result) {
                                    if (result.isValid) {
                                        model.setItem('value', result.value);
                                        updateInputControl('value');
                                        bus.emit('changed', {
                                            newValue: result.value
                                        });
                                    } else if (result.diagnosis === 'required-missing') {
                                        model.setItem('value', result.value);
                                        updateInputControl('value');
                                        bus.emit('changed', {
                                            newValue: result.value
                                        });
                                    }
                                    bus.emit('validation', {
                                        errorMessage: result.errorMessage,
                                        diagnosis: result.diagnosis
                                    });
                                });
                        }
                    }),
                    size: size,
                    multiple: multiple,
                    class: 'form-control',
                    dataElement: 'input'
                }, selectOptions)
            ]);
        }

        /*
         * Given an existing input control, and new model state, update the
         * control to suite the new data.
         * Cases:
         * 
         * - change in source data - fetch new data, populate available values,
         *   reset selected values, remove existing options, add new options.
         *   
         * - change in selected items - remove all selections, add new selections
         * 
         */
        function updateInputControl(changedProperty) {
            switch (changedProperty) {
                case 'value':
                    // just change the selections.
                    var count = buildCount();
                    dom.setContent('input-control.count', count);

                    break;
                case 'availableValues':
                    // rebuild the options
                    // re-apply the selections from the value
                    var options = buildOptions(),
                        count = buildCount();
                    dom.setContent('input-control.input', options);
                    dom.setContent('input-control.count', count);

                    break;
                case 'referenceObjectName':
                    // refetch the available values
                    // set available values
                    // update input control for available values
                    // set value to null


            }
        }

        /*
         * If the parameter is optional, and is empty, return null.
         * If it allows multiple values, wrap single results in an array
         * There is a weird twist where if it ...
         * well, hmm, the only consumer of this, isValid, expects the values
         * to mirror the input rows, so we shouldn't really filter out any
         * values.
         */
        function getInputValue() {
//            var control = dom.getElement('input-container.input');
//            if (!control) {
//                return null;
//            }
//            var input = control.selectedOptions,
//                i, values = [];
//            for (i = 0; i < input.length; i += 1) {
//                values.push(input.item(i).value);
//            }
//            // cute ... allows selecting multiple values but does not expect a sequence...
//            return values;
            return model.getItem('selectedItems');
        }

        function resetModelValue() {
            if (spec.spec.default_values && spec.spec.default_values.length > 0) {
                // nb i'm assuming here that this set of strings is actually comma
                // separated string on the other side.
                model.setItem('value', spec.spec.default_values[0].split(','));
            } else {
                model.setItem('value', null);
            }
        }

        function validate() {
            return Promise.try(function () {
                if (!options.enabled) {
                    return {
                        isValid: true,
                        validated: false,
                        diagnosis: 'disabled'
                    };
                }

                var rawValue = getInputValue(),
                    validationOptions = {
                        required: spec.required()
                    };

                return Validation.validateStringSet(rawValue, validationOptions);
            })
                .then(function (validationResult) {
                    return {
                        isValid: validationResult.isValid,
                        validated: true,
                        diagnosis: validationResult.diagnosis,
                        errorMessage: validationResult.errorMessage,
                        value: validationResult.parsedValue
                    };
                });
        }

        // unsafe, but pretty.
        function getProp(obj, props) {
            props.forEach(function (prop) {
                obj = obj[prop];
            });
            return obj;
        }

        // safe, but ugly.

        function makeLabel(item, showSourceObjectName) {
            return span({style: {wordWrap: 'break-word'}}, [
                span({style: {fontWeight: 'bold'}}, item.id),
                item.desc,
                (function () {
                    if (showSourceObjectName && item.objectName) {
                        return div({style: {padding: '4em', fontStyle: 'italic'}}, item.objectName);
                    }
                })
            ]);
        }

        function fetchData() {
            if (!model.getItem('referenceObjectName')) {
                return [];
            }
            var workspace = new Workspace(runtime.config('services.workspace.url'), {
                token: runtime.authToken()
            }),
                options = spec.spec.textsubdata_options,
                subObjectIdentity = {
                    ref: workspaceId + '/' + model.getItem('referenceObjectName'),
                    included: options.subdata_selection.subdata_included
                };
            return workspace.get_object_subset([
                subObjectIdentity
            ])
                .then(function (results) {
                    // alert('done!');
                    // We have only one ref, so should just be one result.
                    var values = [],
                        selectionId = options.subdata_selection.selection_id,
                        descriptionFields = options.subdata_selection.selection_description || [],
                        descriptionTemplateText = options.subdata_selection.description_template,
                        descriptionTemplate, label;

                    if (!descriptionTemplateText) {
                        descriptionTemplateText = descriptionFields.map(function (field) {
                            return '{{' + field + '}}';
                        }).join(' - ');
                    }

                    descriptionTemplate = Handlebars.compile(descriptionTemplateText);
                    results.forEach(function (result) {
                        if (!result) {
                            return;
                        }
                        var subdata = getProp(result.data, options.subdata_selection.path_to_subdata);

                        if (subdata instanceof Array) {
                            // For arrays we pluck off the "selectionId" property from
                            // each item.
                            subdata.forEach(function (datum) {
                                values.push({
                                    id: datum[selectionId],
                                    desc: descriptionTemplate(datum), // TODO
                                    objectRef: [result.info[6], result.info[0], result.info[4]].join('/'),
                                    objectName: result.info[1]
                                });
                            });
                        } else {
                            Object.keys(subdata).forEach(function (key) {
                                var datum = subdata[key],
                                    id;

                                if (selectionId) {
                                    switch (typeof datum) {
                                        case 'object':
                                            id = datum[selectionId];
                                            break;
                                        case 'string':
                                        case 'number':
                                            if (selectionId === 'value') {
                                                id = datum;
                                            } else {
                                                id = key;
                                            }
                                            break;
                                        default:
                                            id = key;
                                    }
                                } else {
                                    id = key;
                                }

                                values.push({
                                    id: id,
                                    desc: descriptionTemplate(datum), // todo
                                    // desc: id,
                                    objectRef: [result.info[6], result.info[0], result.info[4]].join('/'),
                                    objectName: result.info[1]
                                });
                            });
                        }
                    });
                    return values.map(function (item) {
                        item.label = makeLabel(item, options.show_src_obj);
                        return item;
                    });
                })
                .then(function (data) {
                    // sort by id now.
                    data.sort(function (a, b) {
                        if (a.id > b.id) {
                            return 1;
                        }
                        if (a.id < b.id) {
                            return -1;
                        }
                        return 0;
                    });
                    return data;
                });
        }

        function syncAvailableValues() {
            return Promise.try(function () {
                return fetchData();
            })
                .then(function (data) {
                    model.setItem('availableValues', data);
                    doFilterItems();
                });
        }

        function autoValidate() {
            return validate()
                .then(function (result) {
                    bus.emit('validation', {
                        errorMessage: result.errorMessage,
                        diagnosis: result.diagnosis
                    });
                });
        }


        /*
         * Creates the markup
         * Places it into the dom node
         * Hooks up event listeners
         */
        function render() {
            return Promise.try(function () {
                var events = Events.make(),
                    inputControl = makeInputControl(events, bus),
                    content = div({
                        class: 'input-group',
                        style: {
                            width: '100%'
                        }
                    }, inputControl);

                dom.setContent('input-container', content);
                renderAvailableItems(events);
                renderSelectedItems(events);

                events.attachEvents(container);
            })
                .then(function () {
                    return autoValidate();
                })
                .catch(function (err) {
                    console.error('ERROR in render', err);
                });
        }

        /*
         * In the layout we set up an environment in which one or more parameter
         * rows may be inserted.
         * For the objectInput, there is only ever one control.
         */
        function layout(events) {
            var content = div({
                dataElement: 'main-panel'
            }, [
                div({
                    dataElement: 'input-container'
                })
            ]);
            return {
                content: content,
                events: events
            };
        }

        function registerEvents() {
            /*
             * Issued when thre is a need to have all params reset to their
             * default value.
             */
            bus.on('reset-to-defaults', function (message) {
                resetModelValue();
                // TODO: this should really be set when the linked field is reset...
                model.setItem('availableValues', []);
                model.setItem('referenceObjectName', null);
                doFilterItems();
                updateInputControl('availableValues');
                updateInputControl('value');
            });

            /*
             * Issued when there is an update for this param.
             */
            bus.on('update', function (message) {
                model.setItem('value', message.value);
                updateInputControl('value');
            });
            // NEW


            //                bus.receive({
            //                    test: function (message) {
            //                        return (message.type === 'parameter-changed');
            //                    },
            //                    handle: function(message) {
            //                        console.log('parameter changed', message);
            //                   bus }
            //                });



            //bus.on('parameter-changed', function (message) {
            //    if (message.parameter === subdataOptions.subdata_selection.parameter_id) {

            /* 
             * Called when for an update to any param. This is necessary for
             * any parameter which has a dependency upon any other.
             * 
             */
            // bus.on('parameter')


            bus.listen({
                key: {
                    type: 'parameter-changed',
                    parameter: subdataOptions.subdata_selection.parameter_id
                },
                handle: function (message) {
                    var newValue = message.newValue;
                    if (message.newValue === '') {
                        newValue = null;
                    }
                    model.setItem('referenceObjectName', newValue);
                    syncAvailableValues()
                        .then(function () {
                            updateInputControl('availableValues');
                        })
                        .catch(function (err) {
                            console.error('ERROR syncing available values', err);
                        });
                }
            });

            bus.listen({
                key: {
                    type: 'parameter-value',
                    parameter: subdataOptions.subdata_selection.parameter_id
                },
                handle: function (message) {
                    var newValue = message.newValue;
                    if (message.newValue === '') {
                        newValue = null;
                    }
                    model.setItem('referenceObjectName', newValue);
                    syncAvailableValues()
                        .then(function () {
                            updateInputControl('availableValues');
                        })
                        .catch(function (err) {
                            console.error('ERROR syncing available values', err);
                        });
                }
            });

            // This control has a dependency relationship in that its
            // selection of available values is dependent upon a sub-property
            // of an object referenced by another parameter.
            // Rather than explicitly refer to that parameter, we have a
            // generic capability to receive updates for that value, after
            // which we re-fetch the values, and re-render the control.
//            bus.on('update-reference-object', function (message) {
//                model.setItem('referenceObjectName', value)
//                setReferenceValue(message.objectRef);
//            });
            bus.emit('sync');

            bus.request({
                parameterName: spec.id()
            }, {
                key: {
                    type: 'get-parameter'
                }
            })
                .then(function (message) {
                    console.log('Now i got it again', message);
                });




        }

        // LIFECYCLE API

        function start() {
            return Promise.try(function () {
                bus.on('run', function (message) {
                    parent = message.node;
                    container = parent.appendChild(document.createElement('div'));
                    $container = $(container);
                    dom = Dom.make({
                        node: container
                    });

                    var events = Events.make(),
                        theLayout = layout(events);

                    container.innerHTML = theLayout.content;
//                    
//                    bus.request({
//                        parameter: subdataOptions.subdata_selection.parameter_id
//                    }, {
//                        type: 'get-parameter'
//                    })
//                        .then(function (message) {                            
//                            model.setItem('referenceObjectName', message.value);
//                            render();
//                        })
//                        .catch(function (err) {
//                            console.error('ERROR getting parameter ' + subdataOptions.subdata_selection.parameter_id);
//                        });
//                    

                    render();


                    events.attachEvents(container);

                    registerEvents();

                    // Get initial data.
                    // Weird, but will make it look nicer.
                    Promise.all([
                        bus.request({
                            parameterName: spec.id()
                        },
                            {
                                key: {
                                    type: 'get-parameter'
                                }
                            }),
                        bus.request({
                            parameterName: subdataOptions.subdata_selection.parameter_id
                        },
                            {
                                key: {
                                    type: 'get-parameter'
                                }
                            })
                    ])
                        .spread(function (paramValue, referencedParamValue) {
                            console.log('Got them!', paramValue.value, referencedParamValue.value);
                            model.setItem('selectedItems', paramValue.value);
                            updateInputControl('value');

                            model.setItem('referenceObjectName', referencedParamValue.value);
                            return syncAvailableValues()
                                .then(function () {
                                    updateInputControl('availableValues');
                                })
                                .catch(function (err) {
                                    console.error('ERROR syncing available values', err);
                                });

                        })
                        .catch(function (err) {
                            console.error('ERROR fetching initial data', err);
                        });
                });
            });
        }

        // MAIN

        model = Props.make({
            data: {
                referenceObjectName: null,
                availableValues: [],
                selectedItems: [],
                value: null,
                showFrom: 0,
                showTo: 5
            }
            ,
            onUpdate: function (props) {
                render();
                // updateInputControl(props);
            }
        });

        return {
            start: start
        };
    }

    return {
        make: function (config) {
            return factory(config);
        }
    };
});