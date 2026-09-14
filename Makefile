SCENARIO ?= base
SEED ?= 20260913
PACKAGE ?= core
POETRY ?= poetry
PNPM ?= pnpm
PNPM_INSTALL_FLAGS ?= --frozen-lockfile --config.confirmModulesPurge=false
LOCAL_ARTIFACT_DIR ?= .artifacts

PACKAGE_NAME_core := @jfrz38/pid-controller-core
PACKAGE_NAME_shared := @jfrz38/pid-controller-shared
PACKAGE_NAME_express := @jfrz38/pid-controller-express
PACKAGE_NAME_nestjs := @jfrz38/pid-controller-nestjs

PACKAGE_DIR_core := code/core
PACKAGE_DIR_shared := code/adapters/shared
PACKAGE_DIR_express := code/adapters/express
PACKAGE_DIR_nestjs := code/adapters/nestjs

PACKAGE_NAME = $(PACKAGE_NAME_$(PACKAGE))
PACKAGE_DIR = $(PACKAGE_DIR_$(PACKAGE))

.PHONY: help
help: ## show make targets
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {sub("\\\\n",sprintf("\n%22c"," "), $$2);printf " \033[36m%-20s\033[0m  %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: install install-code install-simulation install-simulation-runner
install: install-code ## install code workspace dependencies

install-code: ## install the TypeScript workspace dependencies
	cd code && $(PNPM) install $(PNPM_INSTALL_FLAGS)

install-simulation: ## install Python simulation dependencies
	cd simulation && $(POETRY) config virtualenvs.in-project true && $(POETRY) install --no-root

install-simulation-runner: ## install simulation runner dependencies
	cd simulation/scripts/runner && $(PNPM) install $(PNPM_INSTALL_FLAGS)

.PHONY: build test lint clean ci
build: ## build all workspace packages
	cd code && $(PNPM) build

test: ## run all workspace tests
	cd code && $(PNPM) test

lint: ## run all workspace linters
	cd code && $(PNPM) lint

clean: ## clean all workspace packages
	cd code && $(PNPM) clean

ci: install-code build test ## run the local CI pipeline

.PHONY: build-core build-shared build-express build-nestjs
build-core: ## build the core package
	cd code && $(PNPM) --filter "$(PACKAGE_NAME_core)..." build

build-shared: ## build the shared adapter package
	cd code && $(PNPM) --filter "$(PACKAGE_NAME_shared)..." build

build-express: ## build the Express adapter package
	cd code && $(PNPM) --filter "$(PACKAGE_NAME_express)..." build

build-nestjs: ## build the NestJS adapter package
	cd code && $(PNPM) --filter "$(PACKAGE_NAME_nestjs)..." build

.PHONY: pack-local
pack-local: build ## build and pack PACKAGE for local installation
	@mkdir -p "$(LOCAL_ARTIFACT_DIR)"
	@rm -f "$(LOCAL_ARTIFACT_DIR)"/*.tgz
	$(PNPM) --dir "$(PACKAGE_DIR)" pack --pack-destination "$(abspath $(LOCAL_ARTIFACT_DIR))"
	@printf '\nInstall or refresh it in another project with:\n  pnpm add --save-exact --force "%s/"*.tgz\n' "$(abspath $(LOCAL_ARTIFACT_DIR))"

.PHONY: test-core test-shared test-express test-nestjs
test-core: ## test the core package
	cd code && $(PNPM) --filter "$(PACKAGE_NAME_core)..." test

test-shared: ## test the shared adapter package
	cd code && $(PNPM) --filter "$(PACKAGE_NAME_shared)..." test

test-express: ## test the Express adapter package
	cd code && $(PNPM) --filter "$(PACKAGE_NAME_express)..." test

test-nestjs: ## test the NestJS adapter package
	cd code && $(PNPM) --filter "$(PACKAGE_NAME_nestjs)..." test

.PHONY: validate-core validate-shared validate-express validate-nestjs
validate-core: install-code build-core test-core ## install, build, and test core

validate-shared: install-code build-shared test-shared ## install, build, and test shared

validate-express: install-code build-express test-express ## install, build, and test Express

validate-nestjs: install-code build-nestjs test-nestjs ## install, build, and test NestJS

.PHONY: simulation-generate simulation-run simulation-report simulation test-simulation test-simulation-python test-simulation-runner
simulation-generate: install-simulation ## generate a simulation scenario with SCENARIO=name
	cd simulation/scenarios && $(POETRY) run python scenario_generator.py $(SCENARIO) --seed $(SEED)

simulation-run: install-code install-simulation-runner ## run a generated simulation scenario with SCENARIO=name
	cd simulation/scripts/runner && $(PNPM) exec ts-node run-log.ts $(SCENARIO)

simulation-report: install-simulation ## generate the simulation visual report
	cd simulation/scripts && $(POETRY) run python logs_reader.py --no-show $(SCENARIO)

simulation: simulation-generate simulation-run simulation-report ## generate, run, and render a simulation scenario

test-simulation-python: install-simulation ## test scenario generation and report parsing
	cd simulation && $(POETRY) run python -m unittest discover -s tests -p "test_*.py"

test-simulation-runner: install-simulation-runner ## test the TypeScript simulation runner
	cd simulation/scripts/runner && $(PNPM) test && $(PNPM) typecheck

test-simulation: test-simulation-python test-simulation-runner ## test all simulation tooling

.PHONY: simulation-express simulation-nestjs
simulation-express: ## start the Express simulation server
	cd simulation/server/express && $(PNPM) start

simulation-nestjs: ## start the NestJS simulation server
	cd simulation/server/nestjs && $(PNPM) start
