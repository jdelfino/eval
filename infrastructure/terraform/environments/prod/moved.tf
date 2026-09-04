# State address migrations.
#
# eval-7qg gated three modules for hibernation with `count` on the *module*
# block (main.tf: module.cloudsql, module.centrifugo, module.centrifugo_staging).
#
# Terraform migrates state addresses automatically when `count` is added to a
# *resource* (foo.bar -> foo.bar[0]), but it does not do so for a *module*.
# Without these blocks, `module.cloudsql.*` in state has no corresponding
# config address, so Terraform reads it as removed and plans to destroy the
# prod Cloud SQL instance and recreate it as `module.cloudsql[0].*` — taking
# the real class data and both database passwords with it.
#
# The resource-level gates added by the same change (modules nat, monitoring
# and dns_ssl, plus the top-level kubernetes_* resources and
# google_sql_database.staging) need nothing here; Terraform moves those on its
# own.
#
# These are state-only operations — no resource is created, changed, or
# destroyed by them. They can be removed once applied to every environment
# holding state, but are harmless to keep and they document the history.
#
# Adding a module-level `count` gate in future (see eval-af4, which proposes
# it for module.nat) requires a matching block here.
#
# Refs: eval-16f

moved {
  from = module.cloudsql
  to   = module.cloudsql[0]
}

moved {
  from = module.centrifugo
  to   = module.centrifugo[0]
}

moved {
  from = module.centrifugo_staging
  to   = module.centrifugo_staging[0]
}
