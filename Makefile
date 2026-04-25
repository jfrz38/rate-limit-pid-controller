SCENARIO ?= base
PACKAGE ?= core
POETRY ?= poetry
PNPM ?= pnpm

PACKAGE_NAME_core := @jfrz38/pid-controller-core
PACKAGE_NAME_shared := @jfrz38/pid-controller-shared
PACKAGE_NAME_express := @jfrz38/pid-controller-express
PACKAGE_NAME_nestjs := @jfrz38/pid-controller-nestjs

PACKAGE_DIR_core := code/core
PACKAGE_DIR_express := code/adapters/express
PACKAGE_DIR_nestjs := code/adapters/nestjs

.PHONY: help
help: ## show make targets
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {sub("\\\\n",sprintf("\n%22c"," "), $$2);printf " \033[36m%-20s\033[0m  %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: install install-code install-simulation install-simulation-runner
install: install-code ## install code workspace dependencies

install-code: ## install the TypeScript workspace dependencies
	cd code && $(PNPM) install --frozen-lockfile

install-simulation: ## install Python simulation dependencies
	cd simulation && $(POETRY) config virtualenvs.in-project true && $(POETRY) install --no-root

install-simulation-runner: ## install simulation runner dependencies
	cd simulation/scripts/runner && $(PNPM) install --frozen-lockfile

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

.PHONY: verify-release-package publish-package
verify-release-package: ## verify PACKAGE=core|express|nestjs version matches VERSION
	@node -e "const pkg='$(PACKAGE)'; const expected='$(VERSION)'; const dirs={core:'code/core',express:'code/adapters/express',nestjs:'code/adapters/nestjs'}; if (!expected) { console.error('VERSION is required'); process.exit(1); } if (!dirs[pkg]) { console.error('Unsupported PACKAGE='+pkg); process.exit(1); } const actual=require('./'+dirs[pkg]+'/package.json').version; if (actual !== expected) { console.error('Release version '+expected+' does not match package version '+actual); process.exit(1); }"

publish-package: ## publish PACKAGE=core|express|nestjs to npm
	@node -e "const pkg='$(PACKAGE)'; if (!['core','express','nestjs'].includes(pkg)) { console.error('Unsupported PACKAGE='+pkg); process.exit(1); }"
	cd $(PACKAGE_DIR_$(PACKAGE)) && $(PNPM) publish --access public --no-git-checks --provenance

.PHONY: simulation-generate simulation-run simulation-report simulation
simulation-generate: install-simulation ## generate a simulation scenario with SCENARIO=name
	cd simulation/scenarios && $(POETRY) run python scenario_generator.py $(SCENARIO)

simulation-run: install-code install-simulation-runner ## run a generated simulation scenario with SCENARIO=name
	cd simulation/scripts/runner && $(PNPM) exec ts-node run-log.ts $(SCENARIO)

simulation-report: install-simulation ## generate the simulation visual report
	cd simulation/scripts && $(POETRY) run python logs_reader.py --no-show $(SCENARIO)

simulation: simulation-generate simulation-run simulation-report ## generate, run, and render a simulation scenario

.PHONY: simulation-express simulation-nestjs
simulation-express: ## start the Express simulation server
	cd simulation/server/express && $(PNPM) start

simulation-nestjs: ## start the NestJS simulation server
	cd simulation/server/nestjs && $(PNPM) start
