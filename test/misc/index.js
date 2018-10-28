const assert = require('assert');
const path = require('path');
const rollup = require('../../dist/rollup');
const { executeBundle, loader } = require('../utils.js');
const { SourceMapConsumer } = require('source-map');
const { getLocator } = require('locate-character');

describe('sanity checks', () => {
	it('exists', () => {
		assert.ok(!!rollup);
	});

	it('has a rollup method', () => {
		assert.equal(typeof rollup.rollup, 'function');
	});

	it('fails without options', () => {
		return rollup
			.rollup()
			.then(() => {
				throw new Error('Missing expected error');
			})
			.catch(err => {
				assert.equal(err.message, 'You must supply an options object to rollup');
			});
	});

	it('node API passes warning and default handler to custom onwarn function', () => {
		let args;
		return rollup
			.rollup({
				input: 'x',
				plugins: [loader({ x: `console.log( 42 );` }), { ongenerate() {} }],
				onwarn(warning, onwarn) {
					args = [warning, onwarn];
				}
			})
			.then(bundle => {
				return bundle.generate({ format: 'es' });
			})
			.then(() => {
				assert.equal(args[0].code, 'PLUGIN_WARNING');
				assert.equal(args[0].pluginCode, 'ONGENERATE_HOOK_DEPRECATED');
				assert.equal(
					args[0].message,
					'The ongenerate hook used by plugin at position 2 is deprecated. The generateBundle hook should be used instead.'
				);
				assert.equal(typeof args[1], 'function');
			});
	});

	it('fails without options.input', () => {
		return rollup
			.rollup({})
			.then(() => {
				throw new Error('Missing expected error');
			})
			.catch(err => {
				assert.equal(err.message, 'You must supply options.input to rollup');
			});
	});

	it('fails with invalid keys', () => {
		const warnings = [];
		const onwarn = warning => warnings.push(warning);
		return rollup
			.rollup({ input: 'x', onwarn, plUgins: [], plugins: [loader({ x: `console.log( 42 );` })] })
			.then(() => {
				assert.deepEqual(warnings, [
					{
						code: 'UNKNOWN_OPTION',
						message:
							'Unknown input option: plUgins. Allowed options: ' + require('./optionList').input
					}
				]);
			});
	});

	it('treats Literals as leaf nodes, even if first literal encountered is null', () => {
		// this test has to be up here, otherwise the bug doesn't have
		// an opportunity to present itself
		return rollup.rollup({
			input: 'x',
			plugins: [loader({ x: `var a = null; a = 'a string';` })]
		});
	});

	it('includes a newline at the end of the bundle', () => {
		return rollup
			.rollup({
				input: 'x',
				plugins: [loader({ x: `console.log( 42 );` })]
			})
			.then(bundle => {
				return bundle.generate({ format: 'iife' });
			})
			.then(({ output: [{ code }] }) => {
				assert.ok(code[code.length - 1] === '\n');
			});
	});

	it('throws on missing output options', () => {
		const warnings = [];

		return rollup
			.rollup({
				input: 'x',
				plugins: [loader({ x: `console.log( 42 );` })],
				onwarn: warning => warnings.push(warning)
			})
			.then(bundle => {
				assert.throws(() => {
					bundle.generate();
				}, /You must supply an options object/);
			});
	});

	it('throws on missing format option', () => {
		const warnings = [];

		return rollup
			.rollup({
				input: 'x',
				plugins: [loader({ x: `console.log( 42 );` })],
				onwarn: warning => warnings.push(warning)
			})
			.then(bundle => {
				assert.throws(() => {
					bundle.generate({ file: 'x' });
				}, /You must specify output\.format, which can be one of 'amd', 'cjs', 'system', 'esm', 'iife' or 'umd'/);
			});
	});

	it('reuses existing error object', () => {
		let error;

		class CustomError extends Error {
			constructor(message, x) {
				super(message);
				this.prop = x.toUpperCase();
			}
		}

		return rollup
			.rollup({
				input: 'x',
				plugins: [
					loader({ x: `console.log( 42 );` }),
					{
						transform(code) {
							error = new CustomError('foo', 'bar');
							this.error(error);
						}
					}
				]
			})
			.catch(e => {
				assert.equal(e, error);
			});
	});

	it('throws when using multiple inputs together with the "file" option', () => {
		const warnings = [];

		return rollup
			.rollup({
				input: ['x', 'y'],
				plugins: [loader({ x: 'console.log( "x" );', y: 'console.log( "y" );' })],
				onwarn: warning => warnings.push(warning)
			})
			.then(bundle => {
				assert.throws(() => {
					bundle.generate({ file: 'x', format: 'es' });
				}, /You must set output\.dir instead of output\.file when generating multiple chunks\./);
			});
	});

	it('does not throw when using a single element array of inputs together with the "file" option', () => {
		const warnings = [];

		return rollup
			.rollup({
				input: ['x'],
				plugins: [loader({ x: 'console.log( "x" );' })],
				onwarn: warning => warnings.push(warning)
			})
			.then(bundle => bundle.generate({ file: 'x', format: 'es' }));
	});

	it('throws when using dynamic imports with the "file" option', () => {
		const warnings = [];

		return rollup
			.rollup({
				input: 'x',
				plugins: [loader({ x: 'console.log( "x" );import("y");', y: 'console.log( "y" );' })],
				onwarn: warning => warnings.push(warning)
			})
			.then(bundle => {
				assert.throws(() => {
					bundle.generate({ file: 'x', format: 'es' });
				}, /You must set output\.dir instead of output\.file when generating multiple chunks\./);
			});
	});

	it('does not throw when using dynamic imports with the "file" option and "inlineDynamicImports"', () => {
		const warnings = [];

		return rollup
			.rollup({
				input: 'x',
				inlineDynamicImports: true,
				plugins: [loader({ x: 'console.log( "x" );import("y");', y: 'console.log( "y" );' })],
				onwarn: warning => warnings.push(warning)
			})
			.then(bundle => bundle.generate({ file: 'x', format: 'es' }));
	});

	it('throws when using the object form of "input" together with the "file" option', () => {
		const warnings = [];

		return rollup
			.rollup({
				input: { main: 'x' },
				plugins: [loader({ x: 'console.log( "x" );' })],
				onwarn: warning => warnings.push(warning)
			})
			.then(bundle => {
				assert.throws(() => {
					bundle.generate({ file: 'x', format: 'es' });
				}, /You must set output\.dir instead of output\.file when providing named inputs\./);
			});
	});

	it('throws when using preserveModules together with the "file" option', () => {
		const warnings = [];

		return rollup
			.rollup({
				input: 'x',
				preserveModules: true,
				plugins: [loader({ x: 'console.log( "x" );' })],
				onwarn: warning => warnings.push(warning)
			})
			.then(bundle => {
				assert.throws(() => {
					bundle.generate({ file: 'x', format: 'es' });
				}, /You must set output\.dir instead of output\.file when using the preserveModules option\./);
			});
	});
});

describe('in-memory sourcemaps', () => {
	it('generates an in-memory sourcemap', () => {
		return rollup
			.rollup({
				input: 'main',
				plugins: [loader({ main: `console.log( 42 );` })]
			})
			.then(bundle => {
				return bundle.generate({
					format: 'cjs',
					sourcemap: true,
					sourcemapFile: path.resolve('bundle.js')
				});
			})
			.then(({ output: [generated] }) => {
				const smc = new SourceMapConsumer(generated.map);
				const locator = getLocator(generated.code, { offsetLine: 1 });

				const generatedLoc = locator('42');
				const loc = smc.originalPositionFor(generatedLoc); // 42
				assert.equal(loc.source, 'main');
				assert.equal(loc.line, 1);
				assert.equal(loc.column, 13);
			});
	});
});

describe('deprecations', () => {
	it('throws a useful error on accessing code/map properties of bundle.generate promise', () => {
		return rollup
			.rollup({
				input: 'x',
				plugins: [loader({ x: `console.log( 42 );` })]
			})
			.then(bundle => {
				let errored = false;

				try {
					const { code, map } = bundle.generate({ format: 'es' });
					console.log(code, map);
				} catch (err) {
					assert.equal(
						err.message,
						`bundle.generate(...) now returns a Promise instead of a { code, map } object`
					);
					errored = true;
				}

				assert.ok(errored);
			});
	});

	it('supports esm format alias', () => {
		return rollup
			.rollup({ input: 'x', plugins: [loader({ x: 'export const x = function () {}' })] })
			.then(bundle => bundle.generate({ format: 'esm' }))
			.then(({ output: [{ code }] }) => {
				assert.equal(code, 'const x = function () {};\n\nexport { x };\n');
			});
	});
});

describe('bundle.write()', () => {
	it('fails without options or options.file', () => {
		return rollup
			.rollup({
				input: 'x',
				plugins: [
					{
						resolveId: () => {
							return 'test';
						},
						load: () => {
							return '// empty';
						}
					}
				]
			})
			.then(bundle => {
				assert.throws(() => {
					bundle.write();
				}, /You must specify output\.file/);

				assert.throws(() => {
					bundle.write({});
				}, /You must specify output\.file/);
			});
	});

	it('expects output.name for IIFE and UMD bundles', () => {
		let bundle;

		return rollup
			.rollup({
				input: 'x',
				plugins: [
					{
						resolveId: () => {
							return 'test';
						},
						load: () => {
							return 'export var foo = 42;';
						}
					}
				]
			})
			.then(rollupInstance => {
				bundle = rollupInstance;
				return bundle.generate({
					format: 'umd'
				});
			})
			.catch(err => {
				assert.throws(() => {
					throw err;
				}, /You must supply output\.name for UMD bundles/);
			})
			.then(() => {
				return bundle.generate({
					format: 'iife'
				});
			})
			.catch(err => {
				assert.throws(() => {
					throw err;
				}, /You must supply output\.name for IIFE bundles/);
			});
	});

	it('throws on es6 format', () => {
		return rollup
			.rollup({
				input: 'x',
				plugins: [
					{
						resolveId: () => {
							return 'test';
						},
						load: () => {
							return '// empty';
						}
					}
				]
			})
			.then(bundle => {
				assert.throws(() => {
					return bundle.generate({ format: 'es6' });
				}, /The `es6` output format is deprecated – use `esm` instead/);
			});
	});

	it('works when output options is an array', () => {
		const warnings = [];
		const options = {
			input: 'x',
			plugins: [loader({ x: `console.log( 42 );` })],
			onwarn: warning => warnings.push(warning),
			output: [
				{
					format: 'cjs'
				},
				{
					format: 'es'
				}
			]
		};
		return rollup.rollup(options).then(bundle => {
			assert.equal(warnings.length, 0, 'No warnings for UNKNOWN');
			assert.throws(() => {
				return Promise.all(options.output.map(o => bundle.write(o)));
			}, /You must specify output\.file/);
		});
	});
});

describe('acorn plugins', () => {
	it('injects plugins passed in acornInjectPlugins', () => {
		let pluginAInjected = false;
		let pluginBInjected = false;

		return rollup
			.rollup({
				input: 'x.js',
				plugins: [loader({ 'x.js': `export default 42` })],
				acornInjectPlugins: [
					function pluginA(Parser) {
						assert.equal(typeof Parser.parse, 'function');
						return class extends Parser {
							readToken(code) {
								pluginAInjected = true;
								super.readToken(code);
							}
						};
					},
					function pluginB(Parser) {
						assert.equal(typeof Parser.parse, 'function');
						return class extends Parser {
							readToken(code) {
								pluginBInjected = true;
								super.readToken(code);
							}
						};
					}
				]
			})
			.then(executeBundle)
			.then(result => {
				assert.equal(result, 42);
				assert(
					pluginAInjected,
					'A plugin passed via acornInjectPlugins should inject itself into Acorn.'
				);
				assert(
					pluginBInjected,
					'A plugin passed via acornInjectPlugins should inject itself into Acorn.'
				);
			});
	});
});

describe('misc', () => {
	it('warns if node builtins are unresolved in a non-CJS, non-ES bundle (#1051)', () => {
		const warnings = [];

		return rollup
			.rollup({
				input: 'input',
				plugins: [
					loader({
						input: `import { format } from 'util';\nexport default format( 'this is a %s', 'formatted string' );`
					})
				],
				onwarn: warning => warnings.push(warning)
			})
			.then(bundle =>
				bundle.generate({
					format: 'iife',
					name: 'myBundle'
				})
			)
			.then(() => {
				const relevantWarnings = warnings.filter(
					warning => warning.code === 'MISSING_NODE_BUILTINS'
				);
				assert.equal(relevantWarnings.length, 1);
				assert.equal(
					relevantWarnings[0].message,
					`Creating a browser bundle that depends on Node.js built-in module ('util'). You might need to include https://www.npmjs.com/package/rollup-plugin-node-builtins`
				);
			});
	});

	it('warns when globals option is specified and a global module name is guessed in a UMD bundle (#2358)', () => {
		const warnings = [];

		return rollup
			.rollup({
				input: 'input',
				plugins: [
					loader({
						input: `import * as _ from 'lodash'`
					})
				],
				onwarn: warning => warnings.push(warning)
			})
			.then(bundle =>
				bundle.generate({
					format: 'umd',
					globals: [],
					name: 'myBundle'
				})
			)
			.then(() => {
				const relevantWarnings = warnings.filter(warning => warning.code === 'MISSING_GLOBAL_NAME');
				assert.equal(relevantWarnings.length, 1);
				assert.equal(
					relevantWarnings[0].message,
					`No name was provided for external module 'lodash' in output.globals – guessing 'lodash'`
				);
			});
	});

	it('sorts chunks in the output', () => {
		const warnings = [];

		return rollup
			.rollup({
				input: ['main1', 'main2'],
				plugins: [
					loader({
						main1: 'import "dep";console.log("main1");',
						main2: 'import "dep";console.log("main2");',
						dep: 'console.log("dep");import("dyndep");',
						dyndep: 'console.log("dyndep");'
					})
				],
				onwarn: warning => warnings.push(warning)
			})
			.then(bundle => bundle.generate({ format: 'es' }))
			.then(({ output }) => {
				assert.equal(warnings.length, 0);
				assert.deepEqual(output.map(({ fileName }) => fileName), [
					'main1.js',
					'main2.js',
					'dyndep.js',
					'chunk-7e6a340f.js'
				]);
			});
	});

	it('ignores falsy plugins', () => {
		return rollup.rollup({
			input: 'x',
			plugins: [loader({ x: `console.log( 42 );` }), null, false, undefined]
		});
	});
});
