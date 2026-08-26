# Validation tests for the gke module's hibernation support
#
# These tests verify that hibernate = true scales both node pools to zero
# without leaving an autoscaling block behind (which would silently keep
# nodes alive), and that hibernate = false preserves normal autoscaling
# behavior. Run with: terraform test

variables {
  environment         = "test"
  project_name        = "testproject"
  project_id          = "testproject-test"
  region              = "us-central1"
  zone                = "us-central1-a"
  network             = "test-network"
  subnetwork          = "test-subnetwork"
  pods_range_name     = "test-pods-range"
  services_range_name = "test-services-range"
}

run "hibernate_zeroes_both_node_pools" {
  command = plan

  variables {
    hibernate = true
  }

  assert {
    condition     = google_container_node_pool.default.node_count == 0
    error_message = "Expected default node pool node_count to be 0 when hibernating"
  }

  assert {
    condition     = google_container_node_pool.executor.node_count == 0
    error_message = "Expected executor node pool node_count to be 0 when hibernating"
  }

  assert {
    condition     = length(google_container_node_pool.default.autoscaling) == 0
    error_message = "Expected default node pool to have no autoscaling block when hibernating — leaving it in place silently keeps nodes alive and defeats hibernation"
  }

  assert {
    condition     = length(google_container_node_pool.executor.autoscaling) == 0
    error_message = "Expected executor node pool to have no autoscaling block when hibernating — leaving it in place silently keeps nodes alive and defeats hibernation"
  }
}

run "normal_mode_keeps_autoscaling" {
  command = plan

  variables {
    hibernate               = false
    default_pool_min_nodes  = 2
    default_pool_max_nodes  = 2
    executor_pool_min_nodes = 0
    executor_pool_max_nodes = 5
  }

  # node_count is Optional+Computed: on a create plan with no configured
  # value it is unknown, not null, so terraform test would error on a
  # condition that references it here. Only assert on the autoscaling block.
  assert {
    condition     = google_container_node_pool.default.autoscaling[0].total_min_node_count == 2
    error_message = "Expected default node pool autoscaling min to be 2 when not hibernating"
  }

  assert {
    condition     = google_container_node_pool.default.autoscaling[0].total_max_node_count == 2
    error_message = "Expected default node pool autoscaling max to be 2 when not hibernating"
  }

  assert {
    condition     = google_container_node_pool.executor.autoscaling[0].total_min_node_count == 0
    error_message = "Expected executor node pool autoscaling min to be 0 when not hibernating"
  }

  assert {
    condition     = google_container_node_pool.executor.autoscaling[0].total_max_node_count == 5
    error_message = "Expected executor node pool autoscaling max to be 5 when not hibernating"
  }
}
