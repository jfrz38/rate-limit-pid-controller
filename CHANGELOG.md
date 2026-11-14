# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- git-cliff: end of header -->
## [Unreleased]


### Added
- Add Node host for adaptive admission component
- Simulate adaptive admission wasm host
- Consume development diagnostics snapshot
- **node:** Stabilize adaptive admission host
- **adapters:** Migrate shared and Express to Rust host
- **nestjs:** Migrate module to Rust host
- **node:** Group request lifecycle errors


### Fixed
- **simulation:** Clarify adaptive controller report
- **simulation:** Align Rust comparison configuration
- **test:** Make consumer smoke portable across pnpm versions
- **adapters:** Preserve request error contracts
- **node:** Avoid native component linking in CI
- **node:** Normalize cross-platform component metadata
- **node:** Ignore host-specific Wasm custom sections
- **node:** Pin component rebuilds per host
- **simulation:** Mark incomplete statistics windows
- **simulation:** Add aggresive peak 10m result
- **simulation:** Bound simulated request duration
- **deps:** Update vulnerable dependencies and group Dependabot updates


### Changed
- Merge migration base into Node host branch
- **core:** Remove TypeScript controller implementation
- Merge remote-tracking branch 'origin/develop' into migrate/adaptive-admission

# Conflicts:
#	.github/workflows/release.yml

## [nestjs-v0.1.0] - 2026-09-15


### Added
- **simulation:** Add reproducible adaptive soak scenarios
- Add long peak scenario
- Add local package packing target


### Fixed
- **core:** Correct PID control and request lifecycle
- **core:** Recover auto-tuner from minimum concurrency

## [nestjs-v0.0.4] - 2026-06-06


### Added
- Add bump version action
- Add cooldown settings to dependabot configuration

Added cooldown period for npm and GitHub Actions updates.


### Fixed
- **core:** Return request promises and expose Priority API
- **core:** Use queue flow metrics for control loops
- **adapters:** Cleanup controller lifecycle
- **simulation:** Await controller requests before shutdown
- **simulation:** Improve run simulation command
- **simulation:** Format code
- **simulation:** Improve log reader generated image


### Changed
- Change publish command from pnpm to npm

Replaced pnpm with npm for publishing to npm.
- Change release title to use TAG variable
- Update Mermaid diagram styles in README.md
- Bump @jfrz38/pid-controller-nestjs to 0.0.4
- Bump @jfrz38/pid-controller-express to 0.0.5
- Bump @jfrz38/pid-controller-core to 0.0.3

## [nestjs-v0.0.3] - 2026-04-25


### Added
- Add comments
- Add tests
- Add covariance tests
- Add latency controller
- Add rejector test
- Add scheduler tests
- Add PID controller test
- Add fixed timer to update queue timeout for priority queue
- Add local initialization
- Add scheduler tests
- Add interval manager
- Add pino log
- Add pino logger
- Add priorityQueue timeout as optional parameter
- Add timeout handler tests
- Add empty scenarios
- Add scenario example
- Add log for rejected request
- Add default parameters tests
- Add missing tests
- Add missing tests
- Add eventual fix to rejector
- Add new default  pid values
- Add mathjs
- Add GitHub Actions workflow for PID simulation
- Add GitHub Actions to Dependabot configuration
- Add codeql action
- Add run simulation cache


### Fixed
- Fix covariance tests
- Fix priority queue implementation
- Fix rejector test
- Fix threshold calculation
- Fix tests
- Fix configs to compile using TS 6


### Changed
- Initial commit
- First approach
- Restructure folders to allow multiple languages
- Update readme
- Update readme
- Update readme
- Refactor classes and add comments
- Refactor classes
- Create statistics tests
- Use math utils to calculate covariance
- Format rejector test
- Replace toHaveBeenCalled to ensure times called
- Improve tests
- Improve logs
- Improve logs
- Implement priority tests
- Use test word
- Improve rejector test
- Implement request test
- Rename test names
- Use latency controller mock
- Rename test names
- Implement pid controller rate limit test
- Improve test coverage
- Implement priority queue test
- Initialize executor
- Use heap package to handle priority queue
- Implement pid controller shutdown
- Implement shutdown manager
- Improve shutdown manager to add SIGINT and SIGTERM
- Improve statistics tests
- Improve priority queue
- Extract priority queue timeout handler as DI
- Update tsconfig
- Create first approach to get an scenario reader and creator
- [iss-4] add default parameters
- [iss-4] add average operation to math utils
- [iss-4] remove interval handling from non interval classes and improve tests using default parameters
- [iss-4] fix test config
- [iss-4] refactor statistics
- [iss-4] create interval handler
- [iss-4] create controller history to handle common data
- [iss-4] refactor application layer
- [iss-4] improve sorted avoiding mutability
- [iss-4] refactor priority queue domain
- [iss-4] improve domain concepts
- [iss-4] add heap test
- [iss-4] initialize controller history
- [iss-4] add npm command to test timer leak
- [iss-4] format code
- [iss-4] format code
- [iss-4] add eslint
- [iss-4] improve run scenario scripts
- [iss-12] export RejectedRequestException and parameters
- Improve log reader avoiding fail on non json line
- Improve exception usage
- Improve rejector to not set initial threshold abruptly
- Improve package.json to compile npm package
- Format code
- Improve usage example
- Improve readme style
- Create express server
- Improve optional default parameters
- Improve logs read
- Improve test coverage
- [iss-16] migrate to pnpm
- [iss-15] move project to core folder
- [iss-15] fix new import path for core folder
- [iss-15] set pnpm workspaces
- [iss-15] add gitignore
- [iss-15] update configs
- [iss-15] add multirepo config
- [iss-15] improve test
- [iss-20] migrate to vitest
- [iss-20] add adapter test config
- [iss-20] create error handler
- [iss-20] add coverage folder
- [iss-20] allow undefined priority in pid controller as long is set to min value
- [iss-20] add coverage dependencies
- [iss-20] create express middleware
- [iss-20] add lint script
- [iss-20] add guard to prevent unstable limit
- [iss-20] use performance now instead of date now
- [iss-20] improve middleware to avoid open events
- [iss-20] remove comments
- [iss-20] create simple express server
- [iss-20] improve package json adding rimraf
- [iss-20] add nestjs folder
- [iss-20] rename package
- [iss-20] add info log at init
- [iss-20] fix express package
- [iss-19] try to create a general transport abstraction to return specified error
- [iss-19] create filter and exception handler for nestjs and express
- [iss-19] add nestjs tests
- [iss-19] improve public interfaces semantic and add tsdoc
- [iss-19] add tsdoc
- [iss-19] create nestjs testing server
- [iss-19] fix URI
- [iss-23] add default values for code and response body for error handling
- [iss-23] remove options
- [iss-22] create shared package with common functionalities
- [iss-22] use shared library
- [iss-22] use shared library for nestjs implementation
- [iss-22] use shared library for express test server
- [iss-22] use shared library for nestjs test server
- [iss-22] update projects references
- Use math js
- Handle rejector threshold
- Improve pid calculation
- Improve pid variable handle
- Improve requests logs
- [iss-22] fix vitest config
- [iss-22] move tests from adapters to shared
- [iss-22] remove unused test
- Improve module test coverage
- Improve test coverage
- Modify default delta
- [iss-26] improve deep merge to avoid interface break parameters
- [iss-30] move files to upper folder
- [iss-30] rename scripts folder
- [iss-30] add logs files to gitignore
- [iss-10] add interval parameters
- [iss-10] fix default parameters test
- [iss-10] refactor update factor
- [iss-10] add readme
- [iss-10] add core readme
- [iss-10] improve http pid options
- [iss-10] rename http rule variable
- [iss-10] add express documentation
- [iss-10] add nestjs readme
- [iss-10] modify express readme
- [iss-10] fix comment
- [iss-10] add simulation readme
- [iss-10] improve simulation readme
- [iss-10] improve express readme
- [iss-10] improve servers parameters
- [iss-10] improve simulation readme
- [iss-10] improve nestjs readme
- [iss-10] add core reference
- [iss-10] improve nestjs readme
- [iss-36] add CODEOWNERS
- [iss-36] add dependabot
- [iss-36] Add GHA to ensure tests execution before merge
- [iss-36] add publish to npm actions
- [iss-36] add permissions
- [iss-36] add permissions
- [iss-36] format actions
- [iss-36] add permissions
- [iss-36] split build for modules
- [iss-36] build modules from parent
- [iss-36] remove build for shared
- [iss-36] fix tests
- [iss-36] add adapters type dependency from core
- [iss-36] fix failing test
- [iss-36] fix failing test
- [iss-36] remove caret from install line
- [iss-36] remove shared publish
- [iss-36] add shared build stage
- [iss-36] fix nestjs tsconfig removing invalid include
- [iss-36] add scenario runner and image output action
- [iss-36] update server example
- [iss-36] remove image generated from gitignore
- [iss-36] update run simulation action
- [iss-36] avoid run build momentarily
- [iss-36] remove poetry cache
- [iss-36] update pnpm version
- [iss-36] update node version
- [iss-36] upgrade versions
- [iss-36] fix runner path
- [iss-36] add PID core build
- [iss-36] fix report image last execution path
- [iss-36] fix report image last execution path
- [iss-36] update gitignore
- [iss-36] force to update last execution image
- [iss-36] restore jobs
- [iss-36] add write permissions
- [iss-36] restore jobs
- [iss-36] update log result image title
- [iss-36] restore build jobs on pr
- [iss-36] add publish workflow_dispatch
- [iss-43] upgrade parent package.json
- [iss-43] update build workflows
- [iss-43] update build workflows
- [fix] test types when using new versions
- Update README to remove progress note

Removed 'in progress...' note from README.
- Revise scenario descriptions in README

Updated scenario descriptions for clarity and consistency.
- [iss-49] upgrade node version
- [iss-49] improve command
- [iss-49] update publish workflows
- [iss-49] skip version changed verification
- [iss-49] remove npm token
- [iss-49] remove skip version changed verification
- [docs] update docs
- [iss-51] update readmes
- [iss-51] fix not found shared package
- [docs] update docs
- [docs] fix gha
- [docs] update docs
- [docs] downgrade to current versions
- Improve .npmrc
- Improve publish action
- Create release action on merge to main
- Update readme
- Update readme
- Improve readme
- Create makefile
- Update dependencies
- Improve actions using makefile
- Upgrade versions


### Removed
- Remove unused mock line
- Remove comments
- Remove comment
- Remove console log
- Remove decrease threshold
- Remove default threshold value
- Remove caret  from package.json
- Remove caret  from package.json
- Remove isExpired validation since evicted requests are removed automatically by timeout
- Remove comment
- Remove publish command from makefile
