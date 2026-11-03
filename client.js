/**
 * Client half of the MCP Manager bundle.
 *
 * Registers one Settings page (`settings.section` id `mcp`): a card-based form
 * for adding or editing an MCP server, with the saved servers below it. All
 * state comes from the Host's loopback route; this module keeps no durable
 * state of its own.
 *
 * Written as a hand-authored `__ModuleLoader__.load` artifact: no JSX, no
 * TypeScript, no Harness Client package imports — only the React seed word and
 * theme tokens, so a DSH upgrade cannot break it at import time.
 */
window.__ModuleLoader__.load({
	id: '@local/dsh-mcp-manager',
	factory(require) {
		const React = require('react');
		const h = React.createElement;
		const { useCallback, useEffect, useRef, useState } = React;

		/** Host route prefix registered by the bundle's `index.js`. */
		const API = '/mcp-manager/api';

		/** Locale namespace owned by this plugin. */
		const NS = 'mcpManager';

		/** Transport documentation, opened in a new tab. */
		const DOCS_URL = 'https://modelcontextprotocol.io/docs/concepts/transports';

		/**
		 * Last resort used before `apply` binds the locale service; keeps the page
		 * renderable (with keys) instead of crashing the slot entry.
		 */
		let fallbackTranslate = (key) => key;

		/** Page-local styles. Rendered as a React element so unmount removes them. */
		const CSS = `
.mcp{display:flex;flex-direction:column;gap:14px;max-width:760px;color:var(--dsw-alias-label-primary)}
.mcp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.mcp-head-text{display:flex;flex-direction:column;gap:5px;min-width:0}
.mcp-title{margin:0;font-size:18px;font-weight:600;line-height:26px}
.mcp-sub{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.mcp-meta{display:flex;align-items:center;gap:6px;margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);flex-wrap:wrap}
.mcp-meta code{font-family:var(--dsw-font-family-mono,ui-monospace,monospace);font-size:11px}
.mcp-head-actions{display:flex;align-items:center;gap:6px;flex:none}

.mcp-link{display:inline-flex;align-items:center;gap:4px;border-radius:6px;color:var(--dsw-alias-label-secondary);text-decoration:none;transition-property:color;transition-duration:150ms;transition-timing-function:ease-out}
.mcp-link:hover{color:var(--dsw-alias-label-primary)}
.mcp-link svg{opacity:.75}

.mcp-card{border-radius:16px;padding:8px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 0 0 1px color-mix(in oklab, var(--dsw-alias-label-primary) 7%, transparent);transition-property:box-shadow;transition-duration:150ms;transition-timing-function:ease-out}
.mcp-card:hover{box-shadow:0 0 0 1px color-mix(in oklab, var(--dsw-alias-label-primary) 10%, transparent)}
.mcp-field{display:flex;flex-direction:column;gap:6px;padding:8px}
.mcp-inline{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 8px}
.mcp-split{height:1px;margin:0 8px;background:color-mix(in oklab, var(--dsw-alias-label-primary) 8%, transparent)}
.mcp-label{font-size:12px;line-height:17px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.mcp-hint{margin:0;font-size:12px;line-height:17px;color:var(--dsw-alias-label-tertiary)}

.mcp-input{font:inherit;font-size:13px;line-height:19px;height:30px;padding:0 9px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);min-width:0;transition-property:border-color,box-shadow;transition-duration:150ms;transition-timing-function:ease-out}
.mcp-input::placeholder{color:var(--dsw-alias-label-caption)}
.mcp-input:hover:not(:disabled){border-color:var(--dsw-alias-border-l3)}
.mcp-input[aria-invalid=true]{border-color:var(--dsw-alias-state-error-primary)}
.mcp-input[data-mono=true]{font-family:var(--dsw-font-family-mono,ui-monospace,monospace);font-size:12px}

.mcp-seg{display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:10px;background:color-mix(in oklab, var(--dsw-alias-label-primary) 7%, transparent);flex:none}
.mcp-seg button{font:inherit;font-size:12px;line-height:17px;font-weight:500;padding:4px 11px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition-property:background-color,color,box-shadow;transition-duration:150ms;transition-timing-function:ease-out}
.mcp-seg button:hover{color:var(--dsw-alias-label-primary)}
.mcp-seg button[data-active=true]{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 0 0 1px color-mix(in oklab, var(--dsw-alias-label-primary) 9%, transparent)}

.mcp-rows{display:flex;flex-direction:column;gap:6px;padding:2px 8px 8px}
.mcp-row{display:grid;grid-template-columns:1fr 30px;gap:6px;align-items:center}
.mcp-row[data-pair=true]{grid-template-columns:minmax(0,1fr) minmax(0,1fr) 30px}
.mcp-add{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;height:30px;margin-top:2px;border-radius:8px;border:.5px dashed color-mix(in oklab, var(--dsw-alias-label-primary) 18%, transparent);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12.5px;cursor:pointer;transition-property:background-color,color,border-color;transition-duration:150ms;transition-timing-function:ease-out}
.mcp-add:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:color-mix(in oklab, var(--dsw-alias-label-primary) 28%, transparent)}
.mcp-add:disabled{opacity:.5;cursor:default}

.mcp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;transition-property:background-color,color,opacity,scale;transition-duration:150ms;transition-timing-function:ease-out}
.mcp-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.mcp-btn:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active);scale:.96}
.mcp-btn:disabled{opacity:.4;cursor:default}
.mcp-btn[data-icon-side=start]{padding-left:10px;padding-right:12px}
.mcp-btn[data-variant=primary]{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);border-color:transparent}
.mcp-btn[data-variant=primary]:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.mcp-btn[data-variant=primary]:active:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.mcp-btn[data-variant=danger]{border-color:color-mix(in oklab, var(--dsw-alias-state-error-primary) 60%, transparent);color:var(--dsw-alias-state-error-primary)}

.mcp-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;flex:none;border-radius:8px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;transition-property:background-color,color,scale;transition-duration:150ms;transition-timing-function:ease-out}
.mcp-iconbtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.mcp-iconbtn:active:not(:disabled){scale:.96}
.mcp-iconbtn:disabled{opacity:.4;cursor:default}

.mcp-alert{display:flex;align-items:flex-start;gap:8px;padding:9px 11px;border-radius:12px;font-size:13px;line-height:19px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 0 0 1px color-mix(in oklab, var(--dsw-alias-label-primary) 7%, transparent)}
.mcp-alert-dot{flex:none;width:6px;height:6px;margin-top:6px;border-radius:50%;background:var(--dsw-alias-label-caption)}
.mcp-alert[data-tone=error]{box-shadow:0 0 0 1px color-mix(in oklab, var(--dsw-alias-state-error-primary) 55%, transparent)}
.mcp-alert[data-tone=error] .mcp-alert-dot{background:var(--dsw-alias-state-error-primary)}
.mcp-alert-body{display:flex;align-items:center;gap:10px;justify-content:space-between;width:100%;min-width:0}

.mcp-list{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}
.mcp-item{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:18px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 0 0 1px color-mix(in oklab, var(--dsw-alias-label-primary) 7%, transparent);transition-property:box-shadow;transition-duration:150ms;transition-timing-function:ease-out}
.mcp-item:hover{box-shadow:0 0 0 1px color-mix(in oklab, var(--dsw-alias-label-primary) 12%, transparent)}
.mcp-item-main{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.mcp-item-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.mcp-name{font-size:13.5px;font-weight:600;line-height:20px}
.mcp-mono{font-family:var(--dsw-font-family-mono,ui-monospace,monospace);font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);word-break:break-all}
.mcp-tag{flex:none;padding:1px 6px;border-radius:5px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);background:color-mix(in oklab, var(--dsw-alias-label-primary) 7%, transparent)}
.mcp-status{display:inline-flex;align-items:center;gap:5px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.mcp-status-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-caption)}
.mcp-status-dot[data-state=active]{background:var(--dsw-alias-state-success-primary)}
.mcp-status-dot[data-state=starting]{background:var(--dsw-alias-state-warn-primary)}
.mcp-status-dot[data-state=failed]{background:var(--dsw-alias-state-error-primary)}
.mcp-item-actions{display:flex;align-items:center;gap:2px;flex:none}

.mcp-switch{position:relative;flex:none;width:30px;height:18px;border-radius:9px;border:.5px solid var(--dsw-alias-border-l2);background:color-mix(in oklab, var(--dsw-alias-label-primary) 12%, transparent);cursor:pointer;padding:0;transition-property:background-color,border-color;transition-duration:150ms;transition-timing-function:ease-out}
.mcp-switch[aria-checked=true]{background:var(--dsw-alias-state-success-primary);border-color:transparent}
.mcp-switch::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:var(--dsw-alias-bg-base);transition-property:transform;transition-duration:150ms;transition-timing-function:ease-out}
.mcp-switch[aria-checked=true]::after{transform:translateX(12px)}
.mcp-switch:disabled{opacity:.5;cursor:default}

.mcp-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:26px 16px;border-radius:16px;border:.5px dashed color-mix(in oklab, var(--dsw-alias-label-primary) 18%, transparent);text-align:center;color:var(--dsw-alias-label-tertiary)}
.mcp-empty-title{font-size:13px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.mcp-empty-body{font-size:12.5px;line-height:19px;max-width:420px}
.mcp-loading{font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}

.mcp-form{display:flex;flex-direction:column;gap:8px;animation:mcp-rise 160ms cubic-bezier(0.2, 0, 0, 1)}
.mcp-form-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 4px 4px}
.mcp-form-title{margin:0;font-size:14px;font-weight:600;line-height:22px}
.mcp-form-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:4px 2px 0}
.mcp-form-inline{animation:none;gap:0}
.mcp-form-inline .mcp-form-foot{border-top:1px solid color-mix(in oklab, var(--dsw-alias-label-primary) 8%, transparent);margin-top:4px;padding:10px 0 2px}
.mcp-section{display:flex;flex-direction:column;gap:6px;padding:10px 0}
.mcp-section:first-child{padding-top:2px}
.mcp-section + .mcp-section{border-top:1px solid color-mix(in oklab, var(--dsw-alias-label-primary) 8%, transparent)}
.mcp-section-label{padding:0 2px}
.mcp-form-inline .mcp-field,.mcp-form-inline .mcp-inline,.mcp-form-inline .mcp-rows{padding:0}
.mcp-item[data-editing=true]{box-shadow:0 0 0 1px color-mix(in oklab, var(--dsw-alias-state-business-primary) 45%, transparent)}

@keyframes mcp-rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
:where(.mcp-btn,.mcp-iconbtn,.mcp-add,.mcp-seg button,.mcp-input,.mcp-switch,.mcp-link):focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
@media (prefers-reduced-motion: reduce){.mcp-form{animation:none}.mcp-btn,.mcp-iconbtn,.mcp-add,.mcp-seg button,.mcp-switch,.mcp-switch::after{transition:none}}
`;

		/**
		 * Call the Host bridge and unwrap its `{ ok, ... }` envelope.
		 * @param path - route below `/mcp-manager/api`.
		 * @param init - optional fetch init.
		 * @returns the response body.
		 */
		async function call(path, init) {
			const response = await fetch(API + path, {
				headers: { 'content-type': 'application/json' },
				...init,
			});
			let body;
			try {
				body = await response.json();
			} catch {
				body = undefined;
			}
			if (!response.ok || body === undefined || body.ok === false) {
				const message = body?.error?.message ?? `Request failed (HTTP ${response.status})`;
				throw new Error(message);
			}
			return body;
		}

		/** A stroked icon in `currentColor`; every glyph in the page shares one weight. */
		function Icon(props) {
			return h(
				'svg',
				{
					width: props.size ?? 14,
					height: props.size ?? 14,
					viewBox: '0 0 16 16',
					fill: 'none',
					stroke: 'currentColor',
					strokeWidth: props.strokeWidth ?? 1.5,
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					'aria-hidden': 'true',
					focusable: 'false',
					style: { flex: 'none', display: 'block' },
				},
				props.children,
			);
		}

		/** Plus glyph for add actions. */
		function PlusIcon(props) {
			return h(Icon, props, h('path', { d: 'M8 3.5v9M3.5 8h9' }));
		}

		/** Trash glyph for remove actions. */
		function TrashIcon(props) {
			return h(
				Icon,
				props,
				h('path', {
					d: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2a1 1 0 0 0 1 .8h3.8a1 1 0 0 0 1-.8l.6-8.2',
				}),
			);
		}

		/** Pencil glyph for edit actions. */
		function EditIcon(props) {
			return h(
				Icon,
				props,
				h('path', { d: 'M9.9 2.9a1.4 1.4 0 0 1 2 2L5.6 11.2l-2.6.7.7-2.6 6.2-6.4Z' }),
			);
		}

		/** Circular arrow glyph for reload. */
		function RefreshIcon(props) {
			return h(Icon, props, h('path', { d: 'M13 8a5 5 0 1 1-1.6-3.7M13 2.8V5.6H10.2' }));
		}

		/** External-link glyph for the docs link. */
		function ExternalIcon(props) {
			return h(
				Icon,
				props,
				h('path', {
					d: 'M9.5 3h3.5v3.5M13 3 8 8M11.5 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1h2.5',
				}),
			);
		}

		/** Empty-state glyph. */
		function PlugIcon(props) {
			return h(
				Icon,
				{ ...props, size: props?.size ?? 22, strokeWidth: 1.3 },
				h('path', { d: 'M6 2.5v3M10 2.5v3M4.5 5.5h7v3a3.5 3.5 0 0 1-7 0v-3ZM8 12v1.5' }),
			);
		}

		/** One toggle with switch semantics. */
		function Switch(props) {
			return h('button', {
				type: 'button',
				className: 'mcp-switch',
				role: 'switch',
				'aria-checked': props.checked ? 'true' : 'false',
				'aria-label': props.label,
				disabled: props.disabled,
				onClick: props.onChange,
			});
		}

		/** A section card: one field or one list, on a raised surface. */
		function Card(props) {
			return h('div', { className: 'mcp-card' }, props.children);
		}

		/** A labelled input inside a card. */
		function Field(props) {
			return h(
				'div',
				{ className: 'mcp-field' },
				h('label', { className: 'mcp-label', htmlFor: props.id }, props.label),
				h('input', {
					id: props.id,
					className: 'mcp-input',
					type: props.type ?? 'text',
					value: props.value,
					placeholder: props.placeholder,
					spellCheck: false,
					autoComplete: 'off',
					autoFocus: props.autoFocus === true,
					inputMode: props.inputMode,
					'data-mono': props.mono ? 'true' : undefined,
					'aria-invalid': props.invalid ? 'true' : undefined,
					disabled: props.disabled,
					onChange: (event) => props.onChange(event.target.value),
				}),
				props.hint ? h('p', { className: 'mcp-hint' }, props.hint) : null,
			);
		}

		/** A label with its control pushed to the trailing edge. */
		function InlineRow(props) {
			return h(
				'div',
				{ className: 'mcp-inline' },
				h('span', { className: 'mcp-label' }, props.label),
				props.children,
			);
		}

		/** Two-choice segmented control. */
		function Segmented(props) {
			return h(
				'div',
				{ className: 'mcp-seg', role: 'group', 'aria-label': props.label },
				props.options.map((option) =>
					h(
						'button',
						{
							key: option.value,
							type: 'button',
							'data-active': option.value === props.value ? 'true' : 'false',
							'aria-pressed': option.value === props.value ? 'true' : 'false',
							onClick: () => props.onChange(option.value),
						},
						option.label,
					),
				),
			);
		}

		/** A full-width "add one more row" control. */
		function AddRow(props) {
			return h(
				'button',
				{ type: 'button', className: 'mcp-add', onClick: props.onClick, disabled: props.disabled },
				h(PlusIcon, { size: 13 }),
				props.label,
			);
		}

		/** An icon-only button with an accessible name and tooltip. */
		function IconButton(props) {
			return h(
				'button',
				{
					type: 'button',
					className: 'mcp-iconbtn',
					'aria-label': props.label,
					title: props.label,
					disabled: props.disabled,
					onClick: props.onClick,
				},
				props.children,
			);
		}

		/** Map a server state to its localized label. */
		function stateLabel(t, state) {
			if (state === 'active') return t('stateActive');
			if (state === 'starting') return t('stateStarting');
			if (state === 'disabled') return t('stateDisabled');
			return t('stateFailed');
		}

		/** The empty form, also used for "add". */
		function blankForm() {
			return {
				mode: 'add',
				originalName: '',
				serverName: '',
				transport: 'stdio',
				command: '',
				args: [''],
				env: [{ key: '', value: '' }],
				cwd: '',
				url: '',
				headers: [{ key: '', value: '' }],
				toolCallTimeoutMs: '',
				enabled: true,
			};
		}

		/** Turn one loaded server into editable form state. */
		function formOf(server) {
			const config = server.config ?? {};
			const args = Array.isArray(config.args) ? config.args.map(String) : [];
			const env =
				config.env && typeof config.env === 'object'
					? Object.keys(config.env).map((key) => ({ key, value: String(config.env[key]) }))
					: [];
			const headers =
				config.headers && typeof config.headers === 'object'
					? Object.keys(config.headers).map((key) => ({ key, value: String(config.headers[key]) }))
					: [];
			return {
				mode: 'edit',
				originalName: server.serverName,
				serverName: server.serverName,
				transport: config.transport === 'streamable-http' ? 'streamable-http' : 'stdio',
				command: config.command ?? '',
				args: args.length > 0 ? args : [''],
				env: env.length > 0 ? env : [{ key: '', value: '' }],
				cwd: config.cwd ?? '',
				url: config.url ?? '',
				headers: headers.length > 0 ? headers : [{ key: '', value: '' }],
				toolCallTimeoutMs: config.toolCallTimeoutMs ?? '',
				enabled: server.enabled !== false,
			};
		}

		/** Build the Host payload from form state, dropping blank rows. */
		function payloadOf(form) {
			return {
				serverName: form.serverName.trim(),
				transport: form.transport,
				command: form.command,
				args: form.args.map((arg) => arg.trim()).filter((arg) => arg !== ''),
				env: form.env
					.filter((row) => row.key.trim() !== '')
					.map((row) => `${row.key.trim()}=${row.value}`),
				cwd: form.cwd.trim(),
				url: form.url.trim(),
				headers: form.headers
					.filter((row) => row.key.trim() !== '')
					.map((row) => `${row.key.trim()}: ${row.value}`),
				toolCallTimeoutMs: form.toolCallTimeoutMs,
				enabled: form.enabled,
			};
		}

		/** A one-column row list (arguments): input plus remove. */
		function ValueList(props) {
			return h(
				'div',
				{ className: 'mcp-rows' },
				props.rows.map((value, index) =>
					h(
						'div',
						{ className: 'mcp-row', key: index },
						h('input', {
							className: 'mcp-input',
							value,
							placeholder: props.placeholder,
							'aria-label': `${props.label} ${index + 1}`,
							spellCheck: false,
							'data-mono': 'true',
							onChange: (event) => props.onChange(index, event.target.value),
						}),
						h(
							IconButton,
							{
								label: props.removeLabel,
								disabled: props.rows.length === 1 && value === '',
								onClick: () => props.onRemove(index),
							},
							h(TrashIcon, { size: 13 }),
						),
					),
				),
				h(AddRow, { label: props.addLabel, onClick: props.onAdd }),
			);
		}

		/** A key/value row list (environment variables, headers). */
		function PairList(props) {
			return h(
				'div',
				{ className: 'mcp-rows' },
				props.rows.map((row, index) =>
					h(
						'div',
						{ className: 'mcp-row', 'data-pair': 'true', key: index },
						h('input', {
							className: 'mcp-input',
							value: row.key,
							placeholder: props.keyPlaceholder,
							'aria-label': `${props.label} ${index + 1}`,
							spellCheck: false,
							onChange: (event) => props.onChange(index, { ...row, key: event.target.value }),
						}),
						h('input', {
							className: 'mcp-input',
							value: row.value,
							placeholder: props.valuePlaceholder,
							'aria-label': `${props.label} ${index + 1} ${props.valueColumn}`,
							spellCheck: false,
							'data-mono': 'true',
							onChange: (event) => props.onChange(index, { ...row, value: event.target.value }),
						}),
						h(
							IconButton,
							{
								label: props.removeLabel,
								disabled: props.rows.length === 1 && row.key === '' && row.value === '',
								onClick: () => props.onRemove(index),
							},
							h(TrashIcon, { size: 13 }),
						),
					),
				),
				h(AddRow, { label: props.addLabel, onClick: props.onAdd }),
			);
		}

		/** The docs link used by both form headers. */
		function DocsLink(props) {
			return h(
				'a',
				{
					className: 'mcp-link',
					href: DOCS_URL,
					target: '_blank',
					rel: 'noreferrer noopener',
					style: { fontSize: '12px', lineHeight: '18px', padding: '2px 4px' },
				},
				props.t('docs'),
				h(ExternalIcon, { size: 12 }),
			);
		}

		/**
		 * One MCP server form.
		 *
		 * `variant: 'panel'` is the add panel: one card per connection field.
		 * `variant: 'inline'` renders the same fields as divided sections inside the
		 * edited server's own row, so editing reads as "this server is open"
		 * instead of looking like a second add flow.
		 */
		function ServerForm(props) {
			const t = props.t;
			const form = props.form;
			const stdio = form.transport === 'stdio';
			const set = props.onChange;
			const attempted = props.attempted === true;
			const inline = props.variant === 'inline';

			/** Group one field block: a card in the panel, a divided section inline. */
			function block(key, labelKey, children) {
				if (inline) {
					return h(
						'div',
						{ className: 'mcp-section', key },
						labelKey === undefined
							? null
							: h('span', { className: 'mcp-label mcp-section-label' }, t(labelKey)),
						children,
					);
				}
				return h(
					Card,
					{ key },
					labelKey === undefined
						? null
						: h('div', { className: 'mcp-field' }, h('span', { className: 'mcp-label' }, t(labelKey))),
					children,
				);
			}

			const nameField = h(Field, {
				id: inline ? 'mcp-name-inline' : 'mcp-name',
				label: t('name'),
				value: form.serverName,
				placeholder: t('namePlaceholder'),
				invalid: attempted && form.serverName.trim() === '',
				autoFocus: inline,
				onChange: (value) => set({ serverName: value }),
				hint: t('nameHint'),
			});

			const segmented = h(Segmented, {
				label: t('type'),
				value: form.transport,
				options: [
					{ value: 'stdio', label: t('stdio') },
					{ value: 'streamable-http', label: t('http') },
				],
				onChange: (value) => set({ transport: value }),
			});

			const identity = inline
				? h(
						'div',
						{ className: 'mcp-section', key: 'identity' },
						nameField,
						h(InlineRow, { label: t('type') }, segmented),
					)
				: h(
						Card,
						{ key: 'identity' },
						nameField,
						h('div', { className: 'mcp-split' }),
						h(InlineRow, { label: t('type') }, segmented),
					);

			const endpoint = stdio
				? h(Field, {
						id: 'mcp-command',
						label: t('command'),
						value: form.command,
						placeholder: t('commandPlaceholder'),
						mono: true,
						invalid: attempted && form.command.trim() === '',
						onChange: (value) => set({ command: value }),
					})
				: h(Field, {
						id: 'mcp-url',
						label: t('url'),
						value: form.url,
						placeholder: t('urlPlaceholder'),
						mono: true,
						invalid: attempted && form.url.trim() === '',
						onChange: (value) => set({ url: value }),
					});

			const rows = stdio
				? h(ValueList, {
						label: t('arguments'),
						rows: form.args,
						placeholder: t('argPlaceholder'),
						addLabel: t('addArgument'),
						removeLabel: t('removeArgument'),
						onAdd: () => set({ args: [...form.args, ''] }),
						onRemove: (index) => set({ args: form.args.filter((_, at) => at !== index) }),
						onChange: (index, value) =>
							set({ args: form.args.map((arg, at) => (at === index ? value : arg)) }),
					})
				: h(PairList, {
						label: t('headers'),
						valueColumn: t('valueColumn'),
						rows: form.headers,
						keyPlaceholder: t('headerName'),
						valuePlaceholder: t('headerValue'),
						addLabel: t('addHeader'),
						removeLabel: t('removeHeader'),
						onAdd: () => set({ headers: [...form.headers, { key: '', value: '' }] }),
						onRemove: (index) => set({ headers: form.headers.filter((_, at) => at !== index) }),
						onChange: (index, row) =>
							set({ headers: form.headers.map((item, at) => (at === index ? row : item)) }),
					});

			const advanced = h(
				'div',
				{ style: { display: 'flex', alignItems: 'center', gap: '10px' } },
				h('input', {
					id: inline ? 'mcp-timeout-inline' : 'mcp-timeout',
					className: 'mcp-input',
					value: form.toolCallTimeoutMs,
					placeholder: '60000',
					inputMode: 'numeric',
					'aria-label': t('timeout'),
					style: { maxWidth: '110px' },
					onChange: (event) => set({ toolCallTimeoutMs: event.target.value.replace(/[^0-9]/g, '') }),
				}),
				h('span', { className: 'mcp-hint' }, t('timeoutHint')),
			);

			const sections = [
				identity,
				block('endpoint', undefined, endpoint),
				block('rows', stdio ? 'arguments' : 'headers', rows),
			];
			if (stdio) {
				sections.push(
					block(
						'env',
						'environment',
						h(PairList, {
							label: t('environment'),
							valueColumn: t('valueColumn'),
							rows: form.env,
							keyPlaceholder: t('keyPlaceholder'),
							valuePlaceholder: t('valuePlaceholder'),
							addLabel: t('addEnvironment'),
							removeLabel: t('removeEnvironment'),
							onAdd: () => set({ env: [...form.env, { key: '', value: '' }] }),
							onRemove: (index) => set({ env: form.env.filter((_, at) => at !== index) }),
							onChange: (index, row) =>
								set({ env: form.env.map((item, at) => (at === index ? row : item)) }),
						}),
					),
				);
				sections.push(
					block(
						'cwd',
						undefined,
						h(Field, {
							id: 'mcp-cwd',
							label: t('cwd'),
							value: form.cwd,
							placeholder: t('cwdPlaceholder'),
							mono: true,
							onChange: (value) => set({ cwd: value }),
							hint: t('cwdHint'),
						}),
					),
				);
			}
			sections.push(block('advanced', 'advanced', advanced));

			return h(
				'div',
				{ className: inline ? 'mcp-form mcp-form-inline' : 'mcp-form' },
				inline
					? null
					: h(
							'div',
							{ className: 'mcp-form-head' },
							h(
								'h3',
								{ className: 'mcp-form-title' },
								form.mode === 'edit' ? t('editTitle') : t('addTitle'),
							),
							h(DocsLink, { t }),
						),
				props.error === undefined
					? null
					: h(
							'div',
							{ className: 'mcp-alert', role: 'alert', 'data-tone': 'error' },
							h('span', { className: 'mcp-alert-dot', 'aria-hidden': 'true' }),
							h('span', null, props.error),
						),
				sections,
				h(
					'div',
					{ className: 'mcp-form-foot' },
					h(
						'button',
						{ type: 'button', className: 'mcp-btn', disabled: props.busy, onClick: props.onCancel },
						t('cancel'),
					),
					h(
						'button',
						{
							type: 'button',
							className: 'mcp-btn',
							'data-variant': 'primary',
							disabled: props.busy,
							onClick: props.onSubmit,
						},
						props.busy ? t('saving') : form.mode === 'edit' ? t('saveChanges') : t('saveServer'),
					),
				),
			);
		}

		/** The MCP manager settings page. */
		function McpManagerSection(props) {
			const t = typeof props.t === 'function' ? props.t : fallbackTranslate;
			const [servers, setServers] = useState(null);
			const [store, setStore] = useState(undefined);
			const [mounted, setMounted] = useState(true);
			const [error, setError] = useState(undefined);
			const [form, setForm] = useState(undefined);
			const [formError, setFormError] = useState(undefined);
			const [busy, setBusy] = useState(false);
			const [confirmRemove, setConfirmRemove] = useState(undefined);
			const [attempted, setAttempted] = useState(false);
			const alive = useRef(true);

			useEffect(() => {
				alive.current = true;
				return () => {
					alive.current = false;
				};
			}, []);

			const load = useCallback(async () => {
				try {
					const body = await call('/servers');
					if (!alive.current) return;
					setServers(body.servers ?? []);
					setStore(body.file);
					setMounted(body.mounted !== false);
					setError(undefined);
				} catch (failure) {
					if (!alive.current) return;
					setError(failure instanceof Error ? failure.message : String(failure));
					setServers((current) => current ?? []);
				}
			}, []);

			useEffect(() => {
				void load();
			}, [load]);

			// Poll while a server is still negotiating, so "Starting…" resolves itself.
			useEffect(() => {
				if (!servers || !servers.some((server) => server.state === 'starting')) return undefined;
				const timer = setTimeout(() => {
					void load();
				}, 1500);
				return () => clearTimeout(timer);
			}, [servers, load]);

			/** Merge a partial change into the open form. */
			function update(patch) {
				setForm((current) => (current === undefined ? current : { ...current, ...patch }));
			}

			async function submit() {
				if (form === undefined) return;
				setAttempted(true);
				const server = payloadOf(form);
				if (server.serverName === '') return setFormError(t('errorNameRequired'));
				if (!/^[A-Za-z0-9_-]{1,32}$/.test(server.serverName)) return setFormError(t('errorNameInvalid'));
				if (server.transport === 'stdio' && server.command.trim() === '') {
					return setFormError(t('errorCommandRequired'));
				}
				if (server.transport === 'streamable-http' && server.url === '') {
					return setFormError(t('errorUrlRequired'));
				}
				setBusy(true);
				setFormError(undefined);
				try {
					let body = await call('/servers', { method: 'POST', body: JSON.stringify({ server }) });
					const renamed =
						form.mode === 'edit' && form.originalName !== '' && form.originalName !== server.serverName;
					if (renamed) {
						// Only after the new row exists: a failed rename must not lose the old one.
						// The removal response is the authoritative list (the POST body still
						// contains the row that was just deleted).
						body = await call('/servers/remove', {
							method: 'POST',
							body: JSON.stringify({ serverName: form.originalName }),
						});
					}
					if (!alive.current) return;
					setServers(body.servers ?? []);
					setMounted(body.mounted !== false);
					setStore(body.file);
					setForm(undefined);
					setAttempted(false);
					setConfirmRemove(undefined);
					setError(undefined);
				} catch (failure) {
					if (alive.current) setFormError(failure instanceof Error ? failure.message : String(failure));
				} finally {
					if (alive.current) setBusy(false);
				}
			}

			async function toggle(server, enabled) {
				setBusy(true);
				try {
					const body = await call('/servers/enabled', {
						method: 'POST',
						body: JSON.stringify({ serverName: server.serverName, enabled }),
					});
					if (!alive.current) return;
					setServers(body.servers ?? []);
					setError(undefined);
				} catch (failure) {
					if (alive.current) setError(failure instanceof Error ? failure.message : String(failure));
				} finally {
					if (alive.current) setBusy(false);
				}
			}

			async function remove(server) {
				setBusy(true);
				try {
					const body = await call('/servers/remove', {
						method: 'POST',
						body: JSON.stringify({ serverName: server.serverName }),
					});
					if (!alive.current) return;
					setServers(body.servers ?? []);
					setConfirmRemove(undefined);
					setError(undefined);
				} catch (failure) {
					if (alive.current) setError(failure instanceof Error ? failure.message : String(failure));
				} finally {
					if (alive.current) setBusy(false);
				}
			}

			/** Props shared by the panel and inline form instances. */
			function formProps(variant) {
				return {
					t,
					form,
					variant,
					attempted,
					busy,
					error: formError,
					onChange: update,
					onCancel: () => {
						setForm(undefined);
						setFormError(undefined);
						setAttempted(false);
					},
					onSubmit: () => void submit(),
				};
			}

			/**
			 * The edited server's own row, expanded into its form. The list identity
			 * (name, transport, state, switch, edit, remove) is replaced by the form,
			 * so editing never looks like a second add flow.
			 */
			function renderEditingRow(server) {
				return h(
					'li',
					{ className: 'mcp-item', 'data-editing': 'true', key: server.serverName },
					h(
						'div',
						{ className: 'mcp-item-main' },
						h(
							'div',
							{ className: 'mcp-form-head' },
							h('h3', { className: 'mcp-form-title' }, t('editingTitle', { name: server.serverName })),
							h(DocsLink, { t }),
						),
						h(ServerForm, formProps('inline')),
					),
				);
			}

			/** Render one server row, or its inline remove confirmation. */
			function renderRow(server) {
				const confirming = confirmRemove === server.serverName;
				const detail =
					server.transport === 'stdio'
						? [server.config?.command, ...(Array.isArray(server.config?.args) ? server.config.args : [])]
								.filter((part) => typeof part === 'string' && part !== '')
								.join(' ')
						: server.config?.url ?? '';
				return h(
					'li',
					{ className: 'mcp-item', key: server.serverName },
					h(
						'div',
						{ className: 'mcp-item-main' },
						h(
							'div',
							{ className: 'mcp-item-top' },
							h('span', { className: 'mcp-name' }, server.serverName),
							h('span', { className: 'mcp-tag' }, server.transport === 'stdio' ? t('stdio') : t('http')),
							h(
								'span',
								{ className: 'mcp-status' },
								h('span', {
									className: 'mcp-status-dot',
									'data-state': server.state,
									'aria-hidden': 'true',
								}),
								stateLabel(t, server.state),
							),
							server.state === 'active' || server.state === 'starting'
								? h(
										'span',
										{ className: 'mcp-status', title: (server.tools ?? []).join('\n') },
										t('toolCount', { count: (server.tools ?? []).length }),
									)
								: null,
						),
						detail === '' ? null : h('span', { className: 'mcp-mono' }, detail),
						confirming
							? h(
									'div',
									{ className: 'mcp-item-top', style: { marginTop: '4px' } },
									h('span', { className: 'mcp-hint' }, t('removeHint', { name: server.serverName })),
									h(
										'button',
										{
											type: 'button',
											className: 'mcp-btn',
											onClick: () => setConfirmRemove(undefined),
										},
										t('cancel'),
									),
									h(
										'button',
										{
											type: 'button',
											className: 'mcp-btn',
											'data-variant': 'danger',
											disabled: busy,
											onClick: () => void remove(server),
										},
										t('remove'),
									),
								)
							: null,
					),
					confirming
						? null
						: h(
								'div',
								{ className: 'mcp-item-actions' },
								h(Switch, {
									checked: server.enabled,
									label: t('toggleLabel', { name: server.serverName }),
									disabled: busy || form !== undefined,
									onChange: () => void toggle(server, !server.enabled),
								}),
								h(
									IconButton,
									{
										label: t('editLabel', { name: server.serverName }),
										disabled: busy || form !== undefined,
										onClick: () => {
											setFormError(undefined);
											setAttempted(false);
											setConfirmRemove(undefined);
											setForm(formOf(server));
										},
									},
									h(EditIcon, { size: 13 }),
								),
								h(
									IconButton,
									{
										label: t('removeLabel', { name: server.serverName }),
										disabled: busy || form !== undefined,
										onClick: () => setConfirmRemove(server.serverName),
									},
									h(TrashIcon, { size: 13 }),
								),
							),
				);
			}

			const rows = servers ?? [];
			const adding = form !== undefined && form.mode === 'add';
			const editingName = form !== undefined && form.mode === 'edit' ? form.originalName : undefined;
			return h(
				'div',
				{ className: 'mcp' },
				h('style', null, CSS),
				h(
					'div',
					{ className: 'mcp-head' },
					h(
						'div',
						{ className: 'mcp-head-text' },
						h('h2', { className: 'mcp-title' }, t('title')),
						h('p', { className: 'mcp-sub' }, t('intro'), ' ', h(DocsLink, { t })),
						h(
							'p',
							{ className: 'mcp-meta' },
							h('span', null, t('storePrefix')),
							h('code', null, store ?? t('storeUnknown')),
						),
					),
					h(
						'div',
						{ className: 'mcp-head-actions' },
						h(
							IconButton,
							{ label: t('reload'), disabled: busy, onClick: () => void load() },
							h(RefreshIcon, { size: 14 }),
						),
						h(
							'button',
							{
								type: 'button',
								className: 'mcp-btn',
								'data-variant': 'primary',
								'data-icon-side': 'start',
								disabled: busy || form !== undefined,
								onClick: () => {
									setFormError(undefined);
									setAttempted(false);
									setConfirmRemove(undefined);
									setForm(blankForm());
								},
							},
							h(PlusIcon, { size: 13 }),
							t('add'),
						),
					),
				),
				error === undefined
					? null
					: h(
							'div',
							{ className: 'mcp-alert', role: 'alert', 'data-tone': 'error' },
							h('span', { className: 'mcp-alert-dot', 'aria-hidden': 'true' }),
							h(
								'div',
								{ className: 'mcp-alert-body' },
								h('span', null, error),
								h(
									'button',
									{ type: 'button', className: 'mcp-btn', onClick: () => void load() },
									t('retry'),
								),
							),
						),
				mounted
					? null
					: h(
							'div',
							{ className: 'mcp-alert', role: 'status' },
							h('span', { className: 'mcp-alert-dot', 'aria-hidden': 'true' }),
							h('span', null, t('notMounted')),
						),
				adding
					? h(ServerForm, {
							t,
							form,
							variant: 'panel',
							attempted,
							busy,
							error: formError,
							onChange: update,
							onCancel: () => {
								setForm(undefined);
								setFormError(undefined);
								setAttempted(false);
							},
							onSubmit: () => void submit(),
						})
					: null,
				servers === null
					? h('p', { className: 'mcp-loading', role: 'status' }, t('loading'))
					: rows.length === 0
						? h(
								'div',
								{ className: 'mcp-empty' },
								h(PlugIcon, { size: 22 }),
								h('span', { className: 'mcp-empty-title' }, t('empty')),
								h('span', { className: 'mcp-empty-body' }, t('emptyHint')),
							)
						: h(
								'ul',
								{ className: 'mcp-list' },
								rows.map((server) =>
									editingName === server.serverName ? renderEditingRow(server) : renderRow(server),
								),
							),
			);
		}

		/** English copy. */
		const en = {
			nav: 'MCP servers',
			title: 'MCP servers',
			intro: 'Connect Model Context Protocol servers so their tools are available as mcp__<server>__<tool>.',
			docs: 'Docs',
			storePrefix: 'Stored in',
			storeUnknown: 'the profile directory',
			reload: 'Reload',
			add: 'Add server',
			addTitle: 'Add an MCP server',
			editTitle: 'Edit MCP server',
			editingTitle: 'Editing {name}',
			loading: 'Loading servers…',
			empty: 'No MCP servers yet',
			emptyHint: 'Add one to give the agent tools from an external MCP server.',
			name: 'Name',
			namePlaceholder: 'MCP server name',
			nameHint: 'Letters, digits, "_" and "-" only. It becomes the tool namespace.',
			valueColumn: 'value',
			type: 'Type',
			stdio: 'STDIO',
			http: 'Streamable HTTP',
			command: 'Command to launch',
			commandPlaceholder: 'npx -y @modelcontextprotocol/server-everything',
			arguments: 'Arguments',
			argPlaceholder: 'an argument',
			addArgument: 'Add argument',
			removeArgument: 'Remove argument',
			environment: 'Environment variables',
			keyPlaceholder: 'Key',
			valuePlaceholder: 'Value',
			addEnvironment: 'Add environment variable',
			removeEnvironment: 'Remove environment variable',
			headers: 'Headers',
			headerName: 'Header',
			headerValue: 'Value',
			addHeader: 'Add header',
			removeHeader: 'Remove header',
			cwd: 'Working directory',
			cwdPlaceholder: '~/code',
			cwdHint: 'Optional. Left empty, the app directory is used.',
			url: 'Server URL',
			urlPlaceholder: 'http://127.0.0.1:3000/mcp',
			advanced: 'Advanced',
			timeout: 'Tool call timeout',
			timeoutHint: 'Milliseconds per call; 60000 when empty.',
			saveServer: 'Save server',
			saveChanges: 'Save changes',
			saving: 'Saving…',
			cancel: 'Cancel',
			remove: 'Remove',
			removeHint: 'Remove {name}? Its tools disappear from the agent.',
			editLabel: 'Edit {name}',
			removeLabel: 'Remove {name}',
			toggleLabel: 'Enable {name}',
			retry: 'Retry',
			stateActive: 'Connected',
			stateStarting: 'Starting…',
			stateDisabled: 'Disabled',
			stateFailed: 'Not connected',
			toolCount: '{count} tools',
			notMounted: 'The server store is not mounted yet. Reload after the plugin finishes starting.',
			errorNameRequired: 'Give the server a name.',
			errorNameInvalid: 'Use 1-32 characters: letters, digits, "_" or "-".',
			errorCommandRequired: 'A command is required for a stdio server.',
			errorUrlRequired: 'A server URL is required for Streamable HTTP.',
		};

		/** Simplified Chinese copy. */
		const zh = {
			nav: 'MCP 服务器',
			title: 'MCP 服务器',
			intro: '连接 Model Context Protocol 服务器，其工具会以 mcp__<服务器>__<工具> 的形式提供给智能体。',
			docs: '文档',
			storePrefix: '存储于',
			storeUnknown: '配置目录',
			reload: '刷新',
			add: '添加服务器',
			addTitle: '添加 MCP 服务器',
			editTitle: '编辑 MCP 服务器',
			editingTitle: '正在编辑 {name}',
			loading: '正在加载服务器…',
			empty: '还没有 MCP 服务器',
			emptyHint: '添加一个即可让智能体使用外部 MCP 服务器的工具。',
			name: '名称',
			namePlaceholder: 'MCP 服务器名称',
			nameHint: '仅限字母、数字、"_" 和 "-"，它还会成为工具的命名空间。',
			valueColumn: '值',
			type: '类型',
			stdio: 'STDIO',
			http: 'Streamable HTTP',
			command: '启动命令',
			commandPlaceholder: 'npx -y @modelcontextprotocol/server-everything',
			arguments: '参数',
			argPlaceholder: '一个参数',
			addArgument: '添加参数',
			removeArgument: '删除参数',
			environment: '环境变量',
			keyPlaceholder: '键',
			valuePlaceholder: '值',
			addEnvironment: '添加环境变量',
			removeEnvironment: '删除环境变量',
			headers: '请求头',
			headerName: '请求头',
			headerValue: '值',
			addHeader: '添加请求头',
			removeHeader: '删除请求头',
			cwd: '工作目录',
			cwdPlaceholder: '~/code',
			cwdHint: '可选，留空则使用应用目录。',
			url: '服务器地址',
			urlPlaceholder: 'http://127.0.0.1:3000/mcp',
			advanced: '高级',
			timeout: '工具调用超时',
			timeoutHint: '每次调用的毫秒数，留空为 60000。',
			saveServer: '保存服务器',
			saveChanges: '保存修改',
			saving: '保存中…',
			cancel: '取消',
			remove: '删除',
			removeHint: '删除 {name}？其工具将从智能体中移除。',
			editLabel: '编辑 {name}',
			removeLabel: '删除 {name}',
			toggleLabel: '启用 {name}',
			retry: '重试',
			stateActive: '已连接',
			stateStarting: '正在启动…',
			stateDisabled: '已禁用',
			stateFailed: '未连接',
			toolCount: '{count} 个工具',
			notMounted: '服务器存储尚未挂载。请在插件启动完成后刷新。',
			errorNameRequired: '请填写服务器名称。',
			errorNameInvalid: '请使用 1-32 个字母、数字、"_" 或 "-"。',
			errorCommandRequired: 'stdio 服务器需要启动命令。',
			errorUrlRequired: 'Streamable HTTP 需要服务器地址。',
		};

		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			fallbackTranslate = t;
			ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'mcp-manager: locale dictionaries');
			ctx.slots.inject('settings.section', () =>
				ctx.slots.register(
					{
						name: 'settings.section',
						id: 'mcp',
						order: 16,
						label: () => t('nav'),
						locale: NS,
					},
					McpManagerSection,
				),
			);
		}

		return { inject: ['slots', 'locale'], apply };
	},
});
