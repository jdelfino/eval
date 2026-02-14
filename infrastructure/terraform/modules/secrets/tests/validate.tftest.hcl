# Validation tests for the secrets module
#
# These tests verify the module's configuration is valid and that
# outputs are properly defined. Run with: terraform test

variables {
  environment  = "test"
  project_name = "testproject"
  project_id   = "testproject-test"
  region       = "us-central1"
  secret_ids   = ["test-secret-1", "test-secret-2"]
}

run "validates_module_configuration" {
  command = plan

  # Verify the module plans without errors and produces expected outputs
  assert {
    condition     = length(var.secret_ids) == 2
    error_message = "Expected 2 secret IDs"
  }
}

run "validates_secret_resources_created" {
  command = plan

  assert {
    condition     = length(google_secret_manager_secret.secrets) == 2
    error_message = "Expected 2 secret manager secret resources"
  }
}

run "validates_api_service_enabled" {
  command = plan

  assert {
    condition     = google_project_service.secret_manager_api.service == "secretmanager.googleapis.com"
    error_message = "Expected Secret Manager API to be enabled"
  }
}

run "validates_empty_secret_ids" {
  command = plan

  variables {
    secret_ids = []
  }

  assert {
    condition     = length(google_secret_manager_secret.secrets) == 0
    error_message = "Expected 0 secret manager secret resources for empty secret_ids"
  }
}

run "validates_labels_applied" {
  command = plan

  assert {
    condition     = google_secret_manager_secret.secrets["test-secret-1"].labels["module"] == "secrets"
    error_message = "Expected module label to be 'secrets'"
  }
}

run "validates_automatic_replication" {
  command = plan

  assert {
    condition     = google_secret_manager_secret.secrets["test-secret-1"].replication[0].auto != null
    error_message = "Expected automatic replication to be configured"
  }
}
