#![deny(unsafe_code)]
//! WebAssembly Component Model boundary for `adaptive-admission-core`.

#[allow(unsafe_code)]
mod bindings {
    wit_bindgen::generate!({
        path: "wit/world.wit",
        world: "adaptive-admission",
        additional_derives: [PartialEq],
    });

    use super::Component;
    export!(Component);
}

use std::cell::RefCell;

use adaptive_admission_core as core;
use bindings::exports::jfrz38::adaptive_admission::controller as wit;

struct Component;

struct AdmissionController {
    inner: RefCell<core::Controller>,
}

impl wit::Guest for Component {
    type AdmissionController = AdmissionController;

    fn default_config() -> wit::Config {
        config_to_wit(core::Config::default())
    }

    fn create(configuration: wit::Config) -> Result<wit::AdmissionController, wit::ConfigError> {
        let configuration = config_from_wit(configuration)?;
        let controller = core::Controller::new(configuration).map_err(config_error_to_wit)?;
        Ok(wit::AdmissionController::new(AdmissionController {
            inner: RefCell::new(controller),
        }))
    }
}

impl wit::GuestAdmissionController for AdmissionController {
    fn submit(&self, priority: u16, now_ms: u64) -> Result<wit::Submission, wit::SubmitError> {
        let priority = core::Priority::new(priority).map_err(|error| match error {
            core::PriorityError::ValueOutOfRange { value } => {
                wit::SubmitError::PriorityOutOfRange(value)
            }
            core::PriorityError::TierOutOfRange { .. }
            | core::PriorityError::CohortOutOfRange { .. } => {
                unreachable!("direct priority construction only validates its value")
            }
        })?;
        let submission = self
            .inner
            .borrow_mut()
            .submit(priority, now_ms.into())
            .map_err(|error| wit::SubmitError::Controller(controller_error_to_wit(error)))?;
        Ok(wit::Submission {
            request_id: submission.request_id.value(),
            actions: actions_to_wit(submission.actions),
        })
    }

    fn complete(
        &self,
        request_id: u64,
        outcome: wit::Outcome,
        now_ms: u64,
    ) -> Result<Vec<wit::Action>, wit::ControllerError> {
        self.inner
            .borrow_mut()
            .complete(
                core::RequestId::from_value(request_id),
                match outcome {
                    wit::Outcome::Success => core::Outcome::Success,
                    wit::Outcome::Failure => core::Outcome::Failure,
                },
                now_ms.into(),
            )
            .map(actions_to_wit)
            .map_err(controller_error_to_wit)
    }

    fn cancel(
        &self,
        request_id: u64,
        now_ms: u64,
    ) -> Result<Vec<wit::Action>, wit::ControllerError> {
        self.inner
            .borrow_mut()
            .cancel(core::RequestId::from_value(request_id), now_ms.into())
            .map(actions_to_wit)
            .map_err(controller_error_to_wit)
    }

    fn advance_time(&self, now_ms: u64) -> Result<Vec<wit::Action>, wit::ControllerError> {
        self.inner
            .borrow_mut()
            .advance_time(now_ms.into())
            .map(actions_to_wit)
            .map_err(controller_error_to_wit)
    }

    fn shutdown(&self, now_ms: u64) -> Result<Vec<wit::Action>, wit::ControllerError> {
        self.inner
            .borrow_mut()
            .shutdown(now_ms.into())
            .map(actions_to_wit)
            .map_err(controller_error_to_wit)
    }

    fn next_deadline(&self) -> Option<u64> {
        self.inner
            .borrow_mut()
            .next_deadline()
            .map(core::Timestamp::as_millis)
    }

    fn latest_statistics(&self) -> Option<wit::StatisticsSnapshot> {
        self.inner
            .borrow()
            .latest_statistics()
            .map(statistics_to_wit)
    }

    fn latest_diagnostics(&self) -> wit::ControllerDiagnostics {
        diagnostics_to_wit(self.inner.borrow().diagnostics())
    }

    fn priority_percentile(&self, percentile: u8) -> Option<u16> {
        self.inner.borrow().priority_percentile(percentile)
    }
}

fn config_from_wit(config: wit::Config) -> Result<core::Config, wit::ConfigError> {
    Ok(core::Config {
        initial_threshold: config.initial_threshold,
        max_concurrent_requests: to_usize(
            config.max_concurrent_requests,
            "max-concurrent-requests",
        )?,
        max_queued_requests: to_usize(config.max_queued_requests, "max-queued-requests")?,
        queue_timeout_ms: config.queue_timeout_ms,
        queue_timeout_ratio: config.queue_timeout_ratio,
        statistics: core::StatisticsConfig {
            min_window_ms: config.statistics.min_window_ms,
            max_window_ms: config.statistics.max_window_ms,
            min_samples: to_usize(config.statistics.min_samples, "statistics.min-samples")?,
            min_percentile_samples: to_usize(
                config.statistics.min_percentile_samples,
                "statistics.min-percentile-samples",
            )?,
            max_samples: to_usize(config.statistics.max_samples, "statistics.max-samples")?,
            latency_percentile: config.statistics.latency_percentile,
        },
        pid: core::PidConfig {
            proportional_gain: config.pid.proportional_gain,
            integral_gain: config.pid.integral_gain,
            derivative_gain: config.pid.derivative_gain,
            interval_ms: config.pid.interval_ms,
            max_delta_percentage: config.pid.max_delta_percentage,
            integral_decay: config.pid.integral_decay,
        },
    })
}

fn config_to_wit(config: core::Config) -> wit::Config {
    wit::Config {
        initial_threshold: config.initial_threshold,
        max_concurrent_requests: config.max_concurrent_requests as u64,
        max_queued_requests: config.max_queued_requests as u64,
        queue_timeout_ms: config.queue_timeout_ms,
        queue_timeout_ratio: config.queue_timeout_ratio,
        statistics: wit::StatisticsConfig {
            min_window_ms: config.statistics.min_window_ms,
            max_window_ms: config.statistics.max_window_ms,
            min_samples: config.statistics.min_samples as u64,
            min_percentile_samples: config.statistics.min_percentile_samples as u64,
            max_samples: config.statistics.max_samples as u64,
            latency_percentile: config.statistics.latency_percentile,
        },
        pid: wit::PidConfig {
            proportional_gain: config.pid.proportional_gain,
            integral_gain: config.pid.integral_gain,
            derivative_gain: config.pid.derivative_gain,
            interval_ms: config.pid.interval_ms,
            max_delta_percentage: config.pid.max_delta_percentage,
            integral_decay: config.pid.integral_decay,
        },
    }
}

fn to_usize(value: u64, field: &str) -> Result<usize, wit::ConfigError> {
    usize::try_from(value).map_err(|_| wit::ConfigError::NumericOverflow(field.to_owned()))
}

fn config_error_to_wit(error: core::ConfigError) -> wit::ConfigError {
    match error {
        core::ConfigError::ThresholdOutOfRange { value } => {
            wit::ConfigError::ThresholdOutOfRange(value)
        }
        core::ConfigError::ZeroConcurrency => wit::ConfigError::ZeroConcurrency,
        core::ConfigError::ZeroQueueTimeout => wit::ConfigError::ZeroQueueTimeout,
        core::ConfigError::QueueTimeoutRatioOutOfRange => {
            wit::ConfigError::QueueTimeoutRatioOutOfRange
        }
        core::ConfigError::ZeroStatisticsMinWindow => wit::ConfigError::ZeroStatisticsMinWindow,
        core::ConfigError::StatisticsWindowOrder {
            minimum_ms,
            maximum_ms,
        } => wit::ConfigError::StatisticsWindowOrder(wit::StatisticsWindowOrder {
            minimum_ms,
            maximum_ms,
        }),
        core::ConfigError::ZeroStatisticsMinSamples => wit::ConfigError::ZeroStatisticsMinSamples,
        core::ConfigError::ZeroStatisticsPercentileSamples => {
            wit::ConfigError::ZeroStatisticsPercentileSamples
        }
        core::ConfigError::StatisticsSampleLimitTooSmall { maximum, required } => {
            wit::ConfigError::StatisticsSampleLimitTooSmall(wit::StatisticsSampleLimit {
                maximum: maximum as u64,
                required: required as u64,
            })
        }
        core::ConfigError::StatisticsPercentileOutOfRange { value } => {
            wit::ConfigError::StatisticsPercentileOutOfRange(value)
        }
        core::ConfigError::InvalidPidGain { name } => {
            let gain = match name {
                "proportional" => wit::PidGain::Proportional,
                "integral" => wit::PidGain::Integral,
                "derivative" => wit::PidGain::Derivative,
                _ => unreachable!("core only emits known PID gain names"),
            };
            wit::ConfigError::InvalidPidGain(gain)
        }
        core::ConfigError::ZeroPidInterval => wit::ConfigError::ZeroPidInterval,
        core::ConfigError::PidDeltaOutOfRange => wit::ConfigError::PidDeltaOutOfRange,
        core::ConfigError::PidDecayOutOfRange => wit::ConfigError::PidDecayOutOfRange,
    }
}

fn controller_error_to_wit(error: core::ControllerError) -> wit::ControllerError {
    match error {
        core::ControllerError::TimeRegression { previous, received } => {
            wit::ControllerError::TimeRegression(wit::TimeRegression {
                previous_ms: previous.as_millis(),
                received_ms: received.as_millis(),
            })
        }
        core::ControllerError::UnknownRequest { request_id } => {
            wit::ControllerError::UnknownRequest(request_id.value())
        }
        core::ControllerError::InvalidTransition {
            request_id,
            operation,
            state,
        } => wit::ControllerError::InvalidTransition(wit::InvalidTransition {
            request_id: request_id.value(),
            operation: operation.to_owned(),
            state: state.to_owned(),
        }),
        core::ControllerError::RequestIdExhausted => wit::ControllerError::RequestIdExhausted,
        core::ControllerError::SequenceExhausted => wit::ControllerError::SequenceExhausted,
        core::ControllerError::DeadlineOverflow => wit::ControllerError::DeadlineOverflow,
    }
}

fn actions_to_wit(actions: Vec<core::Action>) -> Vec<wit::Action> {
    actions.into_iter().map(action_to_wit).collect()
}

fn action_to_wit(action: core::Action) -> wit::Action {
    match action {
        core::Action::ThresholdChanged { previous, current } => {
            wit::Action::ThresholdChanged(wit::ThresholdChange { previous, current })
        }
        core::Action::ConcurrencyChanged { previous, current } => {
            wit::Action::ConcurrencyChanged(wit::ConcurrencyChange {
                previous: previous as u64,
                current: current as u64,
            })
        }
        core::Action::Start { request_id } => wit::Action::Start(request_id.value()),
        core::Action::Reject { request_id, reason } => wit::Action::Reject(wit::RejectedRequest {
            request_id: request_id.value(),
            reason: match reason {
                core::RejectionReason::Threshold {
                    priority,
                    threshold,
                } => wit::RejectionReason::Threshold(wit::ThresholdRejection {
                    priority: priority.value(),
                    threshold,
                }),
                core::RejectionReason::QueueFull => wit::RejectionReason::QueueFull,
                core::RejectionReason::Shutdown => wit::RejectionReason::Shutdown,
            },
        }),
        core::Action::Evict { request_id, reason } => {
            let reason = match reason {
                core::EvictionReason::QueueTimeout => wit::EvictionReason::QueueTimeout,
            };
            wit::Action::Evict(wit::EvictedRequest {
                request_id: request_id.value(),
                reason,
            })
        }
        core::Action::Cancel { request_id, reason } => {
            let reason = match reason {
                core::CancellationReason::Requested => wit::CancellationReason::Requested,
                core::CancellationReason::Shutdown => wit::CancellationReason::Shutdown,
            };
            wit::Action::Cancel(wit::CancelledRequest {
                request_id: request_id.value(),
                reason,
            })
        }
    }
}

fn statistics_to_wit(snapshot: &core::StatisticsSnapshot) -> wit::StatisticsSnapshot {
    wit::StatisticsSnapshot {
        id: snapshot.id,
        started_at_ms: snapshot.started_at.as_millis(),
        ended_at_ms: snapshot.ended_at.as_millis(),
        percentile_latency_ms: snapshot.percentile_latency_ms,
        minimum_latency_ms: snapshot.minimum_latency_ms,
        average_latency_ms: snapshot.average_latency_ms,
        successful_requests: snapshot.successful_requests,
        throughput_per_second: snapshot.throughput_per_second,
        max_in_flight: snapshot.max_in_flight as u64,
    }
}

fn diagnostics_to_wit(diagnostics: core::ControllerDiagnostics) -> wit::ControllerDiagnostics {
    wit::ControllerDiagnostics {
        threshold: diagnostics.threshold,
        concurrency_limit: diagnostics.concurrency_limit as u64,
        queue_timeout_ms: diagnostics.queue_timeout_ms,
        target_latency_ms: diagnostics.target_latency_ms,
        aggregated_latency_ms: diagnostics.aggregated_latency_ms,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn controller(mut config: core::Config) -> AdmissionController {
        config.pid.interval_ms = 10_000;
        AdmissionController {
            inner: RefCell::new(core::Controller::new(config).expect("valid test configuration")),
        }
    }

    #[test]
    fn default_configuration_round_trips_through_wit() {
        let core_config = core::Config::default();
        let wit_config = config_to_wit(core_config);

        assert_eq!(config_from_wit(wit_config), Ok(core_config));
    }

    #[test]
    fn invalid_configuration_is_returned_as_a_structured_error() {
        let mut config = config_to_wit(core::Config::default());
        config.max_concurrent_requests = 0;

        let result = <Component as wit::Guest>::create(config);

        assert!(matches!(result, Err(wit::ConfigError::ZeroConcurrency)));
    }

    #[test]
    fn resource_delegates_request_lifecycle_to_the_core() {
        let config = core::Config {
            max_concurrent_requests: 1,
            ..core::Config::default()
        };
        let controller = controller(config);

        let first =
            <AdmissionController as wit::GuestAdmissionController>::submit(&controller, 0, 1_000)
                .expect("first submission succeeds");
        assert_eq!(first.request_id, 0);
        assert_eq!(first.actions, vec![wit::Action::Start(0)]);

        let second =
            <AdmissionController as wit::GuestAdmissionController>::submit(&controller, 1, 1_000)
                .expect("second submission queues");
        assert_eq!(second.request_id, 1);
        assert!(second.actions.is_empty());

        let cancelled = <AdmissionController as wit::GuestAdmissionController>::cancel(
            &controller,
            second.request_id,
            1_001,
        )
        .expect("queued request can be cancelled");
        assert_eq!(
            cancelled,
            vec![wit::Action::Cancel(wit::CancelledRequest {
                request_id: 1,
                reason: wit::CancellationReason::Requested,
            })]
        );

        let completed = <AdmissionController as wit::GuestAdmissionController>::complete(
            &controller,
            first.request_id,
            wit::Outcome::Success,
            1_002,
        )
        .expect("active request can complete");
        assert!(completed.is_empty());
    }

    #[test]
    fn resource_preserves_controller_errors() {
        let controller = controller(core::Config::default());
        <AdmissionController as wit::GuestAdmissionController>::submit(&controller, 0, 10)
            .expect("submission succeeds");

        let result =
            <AdmissionController as wit::GuestAdmissionController>::advance_time(&controller, 9);

        assert_eq!(
            result,
            Err(wit::ControllerError::TimeRegression(wit::TimeRegression {
                previous_ms: 10,
                received_ms: 9,
            }))
        );
    }

    #[test]
    fn resource_exposes_controller_diagnostics() {
        let controller = controller(core::Config {
            initial_threshold: 700,
            max_concurrent_requests: 3,
            queue_timeout_ms: 250,
            ..core::Config::default()
        });

        let diagnostics =
            <AdmissionController as wit::GuestAdmissionController>::latest_diagnostics(&controller);

        assert_eq!(diagnostics.threshold, 700);
        assert_eq!(diagnostics.concurrency_limit, 3);
        assert_eq!(diagnostics.queue_timeout_ms, 250);
        assert_eq!(diagnostics.target_latency_ms, 100.0);
        assert_eq!(diagnostics.aggregated_latency_ms, None);
    }

    #[test]
    fn all_action_shapes_retain_their_payloads() {
        let actions = actions_to_wit(vec![
            core::Action::ThresholdChanged {
                previous: 500,
                current: 400,
            },
            core::Action::ConcurrencyChanged {
                previous: 2,
                current: 3,
            },
            core::Action::Reject {
                request_id: core::RequestId::from_value(7),
                reason: core::RejectionReason::Threshold {
                    priority: core::Priority::new(600).expect("valid priority"),
                    threshold: 400,
                },
            },
            core::Action::Evict {
                request_id: core::RequestId::from_value(8),
                reason: core::EvictionReason::QueueTimeout,
            },
        ]);

        assert_eq!(
            actions,
            vec![
                wit::Action::ThresholdChanged(wit::ThresholdChange {
                    previous: 500,
                    current: 400,
                }),
                wit::Action::ConcurrencyChanged(wit::ConcurrencyChange {
                    previous: 2,
                    current: 3,
                }),
                wit::Action::Reject(wit::RejectedRequest {
                    request_id: 7,
                    reason: wit::RejectionReason::Threshold(wit::ThresholdRejection {
                        priority: 600,
                        threshold: 400,
                    }),
                }),
                wit::Action::Evict(wit::EvictedRequest {
                    request_id: 8,
                    reason: wit::EvictionReason::QueueTimeout,
                }),
            ]
        );
    }
}
