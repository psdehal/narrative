define([
    'bluebird',
    'common/runtime',
    'common/ui',
    'kb_common/html'
], function(
    Promise,
    Runtime,
    UI,
    html
) {
    'use strict';

    var t = html.tag,
        div = t('div'),
        p = t('p'),
        span = t('span'),
        table = t('table'),
        tr = t('tr'),
        td = t('td'),
        th = t('th');

    function niceState(jobState) {
        var label, icon, color;
        switch (jobState) {
        case 'completed':
            label = 'success';
            icon = 'fa fa-check';
            color = 'green';
            break;
        case 'queued':
            label = jobState;
            icon = 'fa fa-angle-double-right';
            color = 'green';
            break;
        case 'in-progress':
            label = jobState;
            icon = 'fa fa-spinner';
            color = 'green';
            break;
        case 'suspend':
            label = 'suspended';
            icon = 'fa fa-pause';
            color = 'red';
            break;
        case 'error':
            label = jobState;
            icon = 'fa fa-times';
            color = 'red';
            break;
        case 'canceled':
            label = jobState;
            icon = 'fa fa-times';
            color = 'orange';
            break;
        case 'does_not_exist':
            label = 'does not exist';
            icon = 'fa fa-question';
            color: 'orange';
            break;
        default:
            label = jobState;
            icon = 'fa fa-question';
            color = 'black';
        }

        return td({
            style: {
                color: color,
                fontWeight: 'bold'
            },
            class: icon
        }, label);
    }

    function factory() {
        var container, ui, listeners = [],
            jobState = null,
            runtime = Runtime.make(),
            listeningForJob = false,
            jobId,
            parentJobId,
            clickFunction;

        function updateRowStatus() {
            var selector = '[data-element-job-id="' + jobState.job_id + '"]';
            var row = container.querySelector(selector);
            if (row === null) {
                row = document.createElement('tr');
                row.setAttribute('data-element-job-id', jobState.job_id);
                row.classList.add('job-info');
                row.onclick = () => {
                    clickFunction(row, jobState.job_id);
                };
                container.appendChild(row);
            }
            var jobStatus = jobState ? jobState.job_state : 'Determining job state...';
            row.innerHTML = th(jobState.job_id) + niceState(jobStatus);
        }

        function startJobUpdates() {
            if (listeningForJob) {
                return;
            }
            runtime.bus().emit('request-job-update', {
                jobId: parentJobId
            });
            listeningForJob = true;
        }

        function stopJobUpdates() {
            if (listeningForJob) {
                runtime.bus().emit('request-job-completion', {
                    jobId: parentJobId
                });
                listeningForJob = false;
            }
        }

        function handleJobDoesNotExistUpdate(message) {
            stopJobUpdates();
            jobState = {
                job_state: 'does_not_exist'
            };
        }

        function handleJobStatusUpdate(message) {
            if ('child_jobs' in message.jobState) {
                message.jobState.child_jobs.forEach((childState) => {
                    if (childState.job_id === jobId) {
                        jobState = childState;
                        updateRowStatus();
                    }
                });
            }
            // jobState = message.jobState;
            switch (jobState.job_state) {
            case 'queued':
            case 'in-progress':
                startJobUpdates();
                break;
            case 'completed':
                stopJobUpdates();
                break;
            case 'error':
            case 'suspend':
            case 'canceled':
                stopJobUpdates();
                break;
            default:
                stopJobUpdates();
                console.error('Unknown job status', jobState.job_state, message);
                throw new Error('Unknown job status ' + jobState.job_state);
            }
        }

        function listenForJobStatus() {
            var ev = runtime.bus().listen({
                channel: {
                    jobId: parentJobId //jobId
                },
                key: {
                    type: 'job-status'
                },
                handle: handleJobStatusUpdate
            });
            listeners.push(ev);

            ev = runtime.bus().listen({
                channel: {
                    jobId: parentJobId //jobId
                },
                key: {
                    type: 'job-canceled'
                },
                handle: function() {
                    console.warn('job cancelled');
                }
            });
            listeners.push(ev);

            ev = runtime.bus().listen({
                channel: {
                    jobId: parentJobId //jobId
                },
                key: {
                    type: 'job-does-not-exist'
                },
                handle: handleJobDoesNotExistUpdate
            });
            listeners.push(ev);
        }

        function stopListeningForJobStatus() {
            runtime.bus().removeListeners(listeners);
        }

        function start(arg) {
            return Promise.try(function() {
                container = arg.node;
                ui = UI.make({ node: container });

                jobId = arg.jobId;
                parentJobId = arg.parentJobId;
                clickFunction = arg.clickFunction;
                // listeners.push(runtime.bus().on('clock-tick', function() {
                //     updateRowStatus(ui, jobState, container, clickFunction);
                // }));

                listenForJobStatus();
                runtime.bus().emit('request-job-status', {
                    jobId: parentJobId
                });

                listeningForJob = true;

            });
        }

        function stop() {
            return Promise.try(function() {
                stopListeningForJobStatus();
                // runtime.bus().removeListeners(listeners);
            });
        }

        return {
            start: start,
            stop: stop
        };
    }

    return {
        make: function() {
            return factory();
        }
    };

});