/*! Svelte runtime: Copyright (c) 2016-2025 Svelte Contributors. MIT license; see THIRD_PARTY_NOTICES.md. */
//#region node_modules/svelte/src/internal/shared/utils.js
var e = Array.isArray, t = Array.prototype.indexOf, n = Array.prototype.includes, r = Array.from, i = Object.defineProperty, a = Object.getOwnPropertyDescriptor, o = Object.getOwnPropertyDescriptors, s = Object.prototype, c = Array.prototype, l = Object.getPrototypeOf, u = Object.isExtensible, d = () => {};
function f(e) {
	for (var t = 0; t < e.length; t++) e[t]();
}
function p() {
	var e, t;
	return {
		promise: new Promise((n, r) => {
			e = n, t = r;
		}),
		resolve: e,
		reject: t
	};
}
function m(e, t) {
	if (Array.isArray(e)) return e;
	if (t === void 0 || !(Symbol.iterator in e)) return Array.from(e);
	let n = [];
	for (let r of e) if (n.push(r), n.length === t) break;
	return n;
}
var h = 1024, g = 2048, _ = 4096, v = 8192, y = 16384, b = 32768, x = 1 << 25, S = 65536, C = 1 << 19, w = 1 << 20, T = 1 << 25, E = 65536, D = 1 << 21, O = 1 << 22, k = 1 << 23, A = Symbol("$state"), j = Symbol("legacy props"), M = Symbol(""), ee = Symbol("attributes"), te = Symbol("class"), ne = Symbol("style"), re = Symbol("text"), ie = Symbol("form reset"), ae = new class extends Error {
	name = "StaleReactionError";
	message = "The reaction that called `getAbortSignal()` was re-run or destroyed";
}(), oe = !!globalThis.document?.contentType && /* @__PURE__ */ globalThis.document.contentType.includes("xml");
function se(e) {
	throw Error("https://svelte.dev/e/lifecycle_outside_component");
}
//#endregion
//#region node_modules/svelte/src/internal/client/errors.js
function ce() {
	throw Error("https://svelte.dev/e/async_derived_orphan");
}
function le(e, t, n) {
	throw Error("https://svelte.dev/e/each_key_duplicate");
}
function ue(e) {
	throw Error("https://svelte.dev/e/effect_in_teardown");
}
function de() {
	throw Error("https://svelte.dev/e/effect_in_unowned_derived");
}
function fe(e) {
	throw Error("https://svelte.dev/e/effect_orphan");
}
function pe() {
	throw Error("https://svelte.dev/e/effect_update_depth_exceeded");
}
function me(e) {
	throw Error("https://svelte.dev/e/props_invalid_value");
}
function he() {
	throw Error("https://svelte.dev/e/state_descriptors_fixed");
}
function ge() {
	throw Error("https://svelte.dev/e/state_prototype_fixed");
}
function _e() {
	throw Error("https://svelte.dev/e/state_unsafe_mutation");
}
function ve() {
	throw Error("https://svelte.dev/e/svelte_boundary_reset_onerror");
}
//#endregion
//#region node_modules/svelte/src/constants.js
var ye = {}, be = Symbol("uninitialized"), xe = "http://www.w3.org/1999/xhtml", Se = "http://www.w3.org/2000/svg", Ce = "http://www.w3.org/1998/Math/MathML";
function we() {
	console.warn("https://svelte.dev/e/derived_inert");
}
function Te(e) {
	console.warn("https://svelte.dev/e/hydration_mismatch");
}
function Ee() {
	console.warn("https://svelte.dev/e/select_multiple_invalid_value");
}
function De() {
	console.warn("https://svelte.dev/e/svelte_boundary_reset_noop");
}
//#endregion
//#region node_modules/svelte/src/internal/client/dom/hydration.js
var N = !1;
function Oe(e) {
	N = e;
}
var ke;
function Ae(e) {
	if (e === null) throw Te(), ye;
	return ke = e;
}
function je() {
	return Ae(/* @__PURE__ */ pn(ke));
}
function P(e) {
	if (N) {
		if (/* @__PURE__ */ pn(ke) !== null) throw Te(), ye;
		ke = e;
	}
}
function Me(e = 1) {
	if (N) {
		for (var t = e, n = ke; t--;) n = /* @__PURE__ */ pn(n);
		ke = n;
	}
}
function Ne(e = !0) {
	for (var t = 0, n = ke;;) {
		if (n.nodeType === 8) {
			var r = n.data;
			if (r === "]") {
				if (t === 0) return n;
				--t;
			} else (r === "[" || r === "[!" || r[0] === "[" && !isNaN(Number(r.slice(1)))) && (t += 1);
		}
		var i = /* @__PURE__ */ pn(n);
		e && n.remove(), n = i;
	}
}
function Pe(e) {
	if (!e || e.nodeType !== 8) throw Te(), ye;
	return e.data;
}
//#endregion
//#region node_modules/svelte/src/internal/client/reactivity/equality.js
function Fe(e) {
	return e === this.v;
}
function Ie(e, t) {
	return e == e ? e !== t || typeof e == "object" && !!e || typeof e == "function" : t == t;
}
function Le(e) {
	return !Ie(e, this.v);
}
//#endregion
//#region node_modules/svelte/src/internal/shared/clone.js
var Re = [];
function ze(e, t = !1, n = !1) {
	return Be(e, /* @__PURE__ */ new Map(), "", Re, null, n);
}
function Be(t, n, r, i, a = null, o = !1) {
	if (typeof t == "object" && t) {
		var c = n.get(t);
		if (c !== void 0) return c;
		if (t instanceof Map) return new Map(t);
		if (t instanceof Set) return new Set(t);
		if (e(t)) {
			var u = Array(t.length);
			n.set(t, u), a !== null && n.set(a, u);
			for (var d = 0; d < t.length; d += 1) {
				var f = t[d];
				d in t && (u[d] = Be(f, n, r, i, null, o));
			}
			return u;
		}
		if (l(t) === s) {
			u = {}, n.set(t, u), a !== null && n.set(a, u);
			for (var p of Object.keys(t)) u[p] = Be(t[p], n, r, i, null, o);
			return u;
		}
		if (t instanceof Date) return structuredClone(t);
		if (typeof t.toJSON == "function" && !o) return Be(t.toJSON(), n, r, i, t);
	}
	if (t instanceof EventTarget) return t;
	try {
		return structuredClone(t);
	} catch {
		return t;
	}
}
//#endregion
//#region node_modules/svelte/src/internal/client/context.js
var Ve = null;
function He(e) {
	Ve = e;
}
function Ue(e, t = !1, n) {
	Ve = {
		p: Ve,
		i: !1,
		c: null,
		e: null,
		s: e,
		x: null,
		r: Yn,
		l: null
	};
}
function We(e) {
	var t = Ve, n = t.e;
	if (n !== null) {
		t.e = null;
		for (var r of n) wn(r);
	}
	return e !== void 0 && (t.x = e), t.i = !0, Ve = t.p, e ?? {};
}
function Ge() {
	return !0;
}
//#endregion
//#region node_modules/svelte/src/internal/client/dom/task.js
var Ke = [];
function qe() {
	var e = Ke;
	Ke = [], f(e);
}
function Je(e) {
	if (Ke.length === 0 && !Mt) {
		var t = Ke;
		queueMicrotask(() => {
			t === Ke && qe();
		});
	}
	Ke.push(e);
}
function Ye() {
	for (; Ke.length > 0;) qe();
}
function Xe(e) {
	var t = Yn;
	if (t === null) return Kn.f |= k, e;
	if (!(t.f & 32768) && !(t.f & 4)) throw e;
	Ze(e, t);
}
function Ze(e, t) {
	if (!(t !== null && t.f & 16384)) {
		for (; t !== null;) {
			if (t.f & 128) {
				if (!(t.f & 32768)) throw e;
				try {
					t.b.error(e);
					return;
				} catch (t) {
					e = t;
				}
			}
			t = t.parent;
		}
		throw e;
	}
}
//#endregion
//#region node_modules/svelte/src/internal/client/reactivity/status.js
var Qe = ~(g | _ | h);
function $e(e, t) {
	e.f = e.f & Qe | t;
}
function et(e) {
	e.f & 512 || e.deps === null ? $e(e, h) : $e(e, _);
}
//#endregion
//#region node_modules/svelte/src/internal/client/reactivity/utils.js
function tt(e) {
	if (e !== null) for (let t of e) t.f & 2 && t.f & 65536 && (t.f ^= E, tt(t.deps));
}
function nt(e, t, n) {
	e.f & 2048 ? t.add(e) : e.f & 4096 && n.add(e), tt(e.deps), $e(e, h);
}
//#endregion
//#region node_modules/svelte/src/internal/client/reactivity/store.js
var rt = !1;
function it(e) {
	var t = rt;
	try {
		return rt = !1, [e(), rt];
	} finally {
		rt = t;
	}
}
//#endregion
//#region node_modules/svelte/src/internal/client/dom/elements/misc.js
function at(e) {
	N && /* @__PURE__ */ fn(e) !== null && mn(e);
}
var ot = !1;
function st() {
	ot || (ot = !0, document.addEventListener("reset", (e) => {
		Promise.resolve().then(() => {
			if (!e.defaultPrevented) for (let t of e.target.elements) t[ie]?.();
		});
	}, { capture: !0 }));
}
//#endregion
//#region node_modules/svelte/src/internal/client/dom/elements/bindings/shared.js
function ct(e) {
	var t = Kn, n = Yn;
	Jn(null), Xn(null);
	try {
		return e();
	} finally {
		Jn(t), Xn(n);
	}
}
function lt(e, t, n, r = n) {
	e.addEventListener(t, () => ct(n));
	let i = e[ie];
	e[ie] = i ? () => {
		i(), r(!0);
	} : () => r(!0), st();
}
//#endregion
//#region node_modules/svelte/src/reactivity/create-subscriber.js
function ut(e) {
	let t = 0, n = Yt(0), r;
	return () => {
		xn() && (H(n), On(() => (t === 0 && (r = _r(() => e(() => $t(n)))), t += 1, () => {
			Je(() => {
				--t, t === 0 && (r?.(), r = void 0, $t(n));
			});
		})));
	};
}
//#endregion
//#region node_modules/svelte/src/internal/client/dom/blocks/boundary.js
var dt = S | C;
function ft(e, t, n, r) {
	new pt(e, t, n, r);
}
var pt = class {
	parent;
	is_pending = !1;
	transform_error;
	#e;
	#t = N ? ke : null;
	#n;
	#r;
	#i;
	#a = null;
	#o = null;
	#s = null;
	#c = null;
	#l = 0;
	#u = 0;
	#d = !1;
	#f = /* @__PURE__ */ new Set();
	#p = /* @__PURE__ */ new Set();
	#m = null;
	#h = ut(() => (this.#m = Yt(this.#l), () => {
		this.#m = null;
	}));
	constructor(e, t, n, r) {
		this.#e = e, this.#n = t, this.#r = (e) => {
			var t = Yn;
			t.b = this, t.f |= 128, n(e);
		}, this.parent = Yn.b, this.transform_error = r ?? this.parent?.transform_error ?? ((e) => e), this.#i = kn(() => {
			if (N) {
				let e = this.#t;
				je();
				let t = e.data === "[!";
				if (e.data.startsWith("[?")) {
					let t = JSON.parse(e.data.slice(2));
					this.#_(t);
				} else t ? this.#y() : this.#g();
			} else this.#b();
		}, dt), N && (this.#e = ke);
	}
	#g() {
		try {
			this.#a = An(() => this.#r(this.#e));
		} catch (e) {
			this.error(e);
		}
	}
	#_(e) {
		let t = this.#n.failed, { reset: n, invoke_onerror: r } = this.#v(e);
		Je(r), t && (this.#s = An(() => {
			t(this.#e, () => e, () => n);
		}));
	}
	#v(e) {
		var t = !1, n = !1;
		let r = () => {
			t ? De() : (t = !0, n && ve(), this.#s !== null && Ln(this.#s, () => {
				this.#s = null;
			}), this.#S(() => {
				this.#b();
			}));
		};
		return {
			reset: r,
			invoke_onerror: () => {
				try {
					n = !0, this.#n.onerror?.(e, r), n = !1;
				} catch (e) {
					Ze(e, this.#i && this.#i.parent);
				}
			}
		};
	}
	#y() {
		let e = this.#n.pending;
		e && (this.is_pending = !0, this.#o = An(() => e(this.#e)), Je(() => {
			var e = this.#c = document.createDocumentFragment(), t = dn();
			e.append(t), this.#a = this.#S(() => An(() => this.#r(t))), this.#u === 0 && (this.#e.before(e), this.#c = null, Ln(this.#o, () => {
				this.#o = null;
			}), this.#x(Ot));
		}));
	}
	#b() {
		try {
			if (this.is_pending = this.has_pending_snippet(), this.#u = 0, this.#l = 0, this.#a = An(() => {
				this.#r(this.#e);
			}), this.#u > 0) {
				var e = this.#c = document.createDocumentFragment();
				Vn(this.#a, e);
				let t = this.#n.pending;
				this.#o = An(() => t(this.#e));
			} else this.#x(Ot);
		} catch (e) {
			this.error(e);
		}
	}
	#x(e) {
		this.is_pending = !1, e.transfer_effects(this.#f, this.#p);
	}
	defer_effect(e) {
		nt(e, this.#f, this.#p);
	}
	is_rendered() {
		return !this.is_pending && (!this.parent || this.parent.is_rendered());
	}
	has_pending_snippet() {
		return !!this.#n.pending;
	}
	#S(e) {
		var t = Yn, n = Kn, r = Ve;
		Xn(this.#i), Jn(this.#i), He(this.#i.ctx);
		try {
			return Rt.ensure(), e();
		} catch (e) {
			return Xe(e), null;
		} finally {
			Xn(t), Jn(n), He(r);
		}
	}
	#C(e, t) {
		this.has_pending_snippet() ? (this.#u += e, this.#u === 0 && (this.#x(t), this.#o && Ln(this.#o, () => {
			this.#o = null;
		}), this.#c &&= (this.#e.before(this.#c), null))) : this.parent && this.parent.#C(e, t);
	}
	update_pending_count(e, t) {
		this.#C(e, t), this.#l += e, !(!this.#m || this.#d) && (this.#d = !0, Je(() => {
			this.#d = !1, this.#m && Zt(this.#m, this.#l);
		}));
	}
	get_effect_pending() {
		return this.#h(), H(this.#m);
	}
	error(e) {
		if (!this.#n.onerror && !this.#n.failed) throw e;
		Ot?.is_fork ? (this.#a && Ot.skip_effect(this.#a), this.#o && Ot.skip_effect(this.#o), this.#s && Ot.skip_effect(this.#s), Ot.oncommit(() => {
			this.#w(e);
		})) : this.#w(e);
	}
	#w(e) {
		this.#a &&= (Pn(this.#a), null), this.#o &&= (Pn(this.#o), null), this.#s &&= (Pn(this.#s), null), N && (Ae(this.#t), Me(), Ae(Ne()));
		let t = this.#n.failed, n = (e) => {
			let { reset: n, invoke_onerror: r } = this.#v(e);
			r(), t && (this.#s = this.#S(() => {
				try {
					return An(() => {
						var r = Yn;
						r.b = this, r.f |= 128, t(this.#e, () => e, () => n);
					});
				} catch (e) {
					return Ze(e, this.#i.parent), null;
				}
			}));
		};
		Je(() => {
			var t;
			try {
				t = this.transform_error(e);
			} catch (e) {
				Ze(e, this.#i && this.#i.parent);
				return;
			}
			typeof t == "object" && t && typeof t.then == "function" ? t.then(n, (e) => Ze(e, this.#i && this.#i.parent)) : n(t);
		});
	}
};
//#endregion
//#region node_modules/svelte/src/internal/client/reactivity/async.js
function mt(e, t, n, r) {
	let i = Ge() ? vt : xt;
	var a = e.filter((e) => !e.settled), o = t.map(i);
	if (n.length === 0 && a.length === 0) {
		r(o);
		return;
	}
	var s = Yn, c = ht(), l = a.length === 1 ? a[0].promise : a.length > 1 ? Promise.all(a.map((e) => e.promise)) : null;
	function u(e) {
		if (!(s.f & 16384)) {
			c();
			try {
				r([...o, ...e]);
			} catch (e) {
				Ze(e, s);
			}
			gt();
		}
	}
	var d = _t();
	if (n.length === 0) {
		l.then(() => u([])).finally(d);
		return;
	}
	function f() {
		Promise.all(n.map((e) => /* @__PURE__ */ bt(e))).then(u).catch((e) => Ze(e, s)).finally(d);
	}
	l ? l.then(() => {
		c(), f(), gt();
	}) : f();
}
function ht() {
	var e = Yn, t = Kn, n = Ve, r = Ot;
	return function(i = !0) {
		Xn(e), Jn(t), He(n), i && !(e.f & 16384) && (r?.activate(), r?.apply());
	};
}
function gt(e = !0) {
	Xn(null), Jn(null), He(null), e && Ot?.deactivate();
}
function _t() {
	var e = Yn, t = e.b, n = Ot, r = !!t?.is_rendered();
	return t?.update_pending_count(1, n), n.increment(r, e), () => {
		t?.update_pending_count(-1, n), n.decrement(r, e);
	};
}
/*#__NO_SIDE_EFFECTS__*/
function vt(e) {
	var t = 2 | g;
	return Yn !== null && (Yn.f |= C), {
		ctx: Ve,
		deps: null,
		effects: null,
		equals: Fe,
		f: t,
		fn: e,
		reactions: null,
		rv: 0,
		v: be,
		wv: 0,
		parent: Yn,
		ac: null
	};
}
var yt = Symbol("obsolete");
/*#__NO_SIDE_EFFECTS__*/
function bt(e, t, n) {
	let r = Yn;
	r === null && ce();
	var i = void 0, a = Yt(be), o = !Kn, s = /* @__PURE__ */ new Set();
	return Dn(() => {
		var t = Yn, n = p();
		i = n.promise;
		try {
			Promise.resolve(e()).then(n.resolve, (e) => {
				e !== ae && n.reject(e);
			}).finally(gt);
		} catch (e) {
			n.reject(e), gt();
		}
		var c = Ot;
		if (o) {
			if (t.f & 32768) var l = _t();
			if (r.b?.is_rendered()) c.async_deriveds.get(t)?.reject(yt);
			else for (let e of s.values()) e.reject(yt);
			s.add(n), c.async_deriveds.set(t, n);
		}
		let u = (e, t = void 0) => {
			l?.(), s.delete(n), t !== yt && (c.activate(), t ? (a.f |= k, Zt(a, t)) : (a.f & 8388608 && (a.f ^= k), Zt(a, e)), c.deactivate());
		};
		n.promise.then(u, (e) => u(null, e || "unknown"));
	}), Sn(() => {
		for (let e of s) e.reject(yt);
	}), new Promise((e) => {
		function t(n) {
			function r() {
				n === i ? e(a) : t(i);
			}
			n.then(r, r);
		}
		t(i);
	});
}
/*#__NO_SIDE_EFFECTS__*/
function F(e) {
	let t = /* @__PURE__ */ vt(e);
	return Qn(t), t;
}
/*#__NO_SIDE_EFFECTS__*/
function xt(e) {
	let t = /* @__PURE__ */ vt(e);
	return t.equals = Le, t;
}
function St(e) {
	var t = e.effects;
	if (t !== null) {
		e.effects = null;
		for (var n = 0; n < t.length; n += 1) Pn(t[n]);
	}
}
function Ct(e) {
	var t, n = Yn, r = e.parent;
	if (!Wn && r !== null && e.v !== be && r.f & 24576) return we(), e.v;
	Xn(r);
	try {
		e.f &= ~E, St(e), t = ur(e);
	} finally {
		Xn(n);
	}
	return t;
}
function wt(e) {
	var t = Ct(e);
	!e.equals(t) && (e.wv = sr(), (!Ot?.is_fork || e.deps === null) && (Ot === null ? e.v = t : (Ot.capture(e, t, !0), kt?.capture(e, t, !0)), e.deps === null)) ? $e(e, h) : Wn || (At === null ? et(e) : (xn() || Ot?.is_fork) && At.set(e, t));
}
function Tt(e) {
	if (e.effects !== null) for (let t of e.effects) (t.teardown || t.ac) && (t.teardown?.(), t.ac !== null && ct(() => {
		t.ac.abort(ae), t.ac = null;
	}), t.fn !== null && (t.teardown = d), fr(t, 0), Mn(t));
}
function Et(e) {
	if (e.effects !== null) for (let t of e.effects) t.teardown && t.fn !== null && pr(t);
}
//#endregion
//#region node_modules/svelte/src/internal/client/reactivity/batch.js
var Dt = null, Ot = null, kt = null, At = null, jt = null, Mt = !1, Nt = !1, Pt = null, Ft = null, It = 0, Lt = 1, Rt = class e {
	id = Lt++;
	#e = !1;
	linked = !0;
	#t = null;
	#n = null;
	async_deriveds = /* @__PURE__ */ new Map();
	current = /* @__PURE__ */ new Map();
	previous = /* @__PURE__ */ new Map();
	#r = /* @__PURE__ */ new Set();
	#i = /* @__PURE__ */ new Set();
	#a = 0;
	#o = /* @__PURE__ */ new Map();
	#s = null;
	#c = [];
	#l = [];
	#u = /* @__PURE__ */ new Set();
	#d = /* @__PURE__ */ new Set();
	#f = /* @__PURE__ */ new Map();
	#p = /* @__PURE__ */ new Set();
	is_fork = !1;
	#m = !1;
	constructor() {
		Dt === null ? Dt = this : (Dt.#n = this, this.#t = Dt), Dt = this;
	}
	#h() {
		if (this.is_fork) return !0;
		for (let n of this.#o.keys()) {
			for (var e = n, t = !1; e.parent !== null;) {
				if (this.#f.has(e)) {
					t = !0;
					break;
				}
				e = e.parent;
			}
			if (!t) return !0;
		}
		return !1;
	}
	skip_effect(e) {
		this.#f.has(e) || this.#f.set(e, {
			d: [],
			m: []
		}), this.#p.delete(e);
	}
	unskip_effect(e, t = (e) => this.schedule(e)) {
		var n = this.#f.get(e);
		if (n) {
			this.#f.delete(e);
			for (var r of n.d) $e(r, g), t(r);
			for (r of n.m) $e(r, _), t(r);
		}
		this.#p.add(e);
	}
	#g() {
		this.#e = !0, It++ > 1e3 && (this.#x(), Bt());
		for (let e of this.#u) this.#d.delete(e), $e(e, g), this.schedule(e);
		for (let e of this.#d) $e(e, _), this.schedule(e);
		let t = this.#c;
		this.#c = [], this.apply();
		var n = Pt = [], r = [], i = Ft = [];
		for (let e of t) try {
			this.#_(e, n, r);
		} catch (t) {
			throw Gt(e), this.#h() || this.discard(), t;
		}
		if (Ot = null, i.length > 0) {
			var a = e.ensure();
			for (let e of i) a.schedule(e);
		}
		if (Pt = null, Ft = null, this.#h()) {
			this.#b(r), this.#b(n);
			for (let [e, t] of this.#f) Wt(e, t);
			i.length > 0 && Ot.#g();
			return;
		}
		let o = this.#v();
		if (o) this.#b(r), this.#b(n), o.#y(this);
		else {
			this.#u.clear(), this.#d.clear();
			for (let e of this.#r) e(this);
			this.#r.clear(), kt = this, Ht(r), Ht(n), kt = null, this.#s?.resolve();
			var s = Ot;
			if (this.#a === 0 && (this.#c.length === 0 || s !== null) && this.#x(), this.#c.length > 0) {
				if (s !== null) {
					let e = s;
					e.#c.push(...this.#c.filter((t) => !e.#c.includes(t)));
				} else s = this;
			}
			s !== null && (qt.clear(), s.#g());
		}
	}
	#_(e, t, n) {
		e.f ^= h;
		for (var r = e.first; r !== null;) {
			var i = r.f, a = !!(i & 96);
			if (!(a && i & 1024 || i & 8192 || this.#f.has(r)) && r.fn !== null) {
				a ? r.f ^= h : i & 4 ? t.push(r) : cr(r) && (i & 16 && this.#d.add(r), pr(r));
				var o = r.first;
				if (o !== null) {
					r = o;
					continue;
				}
			}
			for (; r !== null;) {
				var s = r.next;
				if (s !== null) {
					r = s;
					break;
				}
				r = r.parent;
			}
		}
	}
	#v() {
		for (var e = this.#t; e !== null;) {
			if (!e.is_fork) {
				for (let [t, [, n]] of this.current) if (e.current.has(t) && !n) return e;
			}
			e = e.#t;
		}
		return null;
	}
	#y(e) {
		for (let [t, n] of e.current) !this.previous.has(t) && e.previous.has(t) && this.previous.set(t, e.previous.get(t)), this.current.set(t, n);
		for (let [t, n] of e.async_deriveds) {
			let e = this.async_deriveds.get(t);
			e && n.promise.then(e.resolve).catch(e.reject);
		}
		e.async_deriveds.clear(), this.transfer_effects(e.#u, e.#d);
		let t = (e) => {
			var n = e.reactions;
			if (n !== null && !(e.f & 2 && !(e.f & 6144))) for (let e of n) {
				var r = e.f;
				if (r & 2) t(e);
				else {
					var i = e;
					r & 4194320 && !this.async_deriveds.has(i) && (this.#d.delete(i), $e(i, g), this.schedule(i));
				}
			}
		};
		for (let e of this.current.keys()) t(e);
		this.oncommit(() => e.discard()), e.#x(), Ot = this, this.#g();
	}
	#b(e) {
		for (var t = 0; t < e.length; t += 1) nt(e[t], this.#u, this.#d);
	}
	capture(e, t, n = !1) {
		e.v !== be && !this.previous.has(e) && this.previous.set(e, e.v), e.f & 8388608 || (this.current.set(e, [t, n]), At?.set(e, t)), this.is_fork || (e.v = t);
	}
	activate() {
		Ot = this;
	}
	deactivate() {
		Ot = null, At = null;
	}
	flush() {
		try {
			Nt = !0, Ot = this, this.#g();
		} finally {
			It = 0, jt = null, Pt = null, Ft = null, Nt = !1, Ot = null, At = null, qt.clear();
		}
	}
	discard() {
		for (let e of this.#i) e(this);
		this.#i.clear();
		for (let e of this.async_deriveds.values()) e.reject(yt);
		this.#x(), this.#s?.resolve();
	}
	register_created_effect(e) {
		this.#l.push(e);
	}
	increment(e, t) {
		if (this.#a += 1, e) {
			let e = this.#o.get(t) ?? 0;
			this.#o.set(t, e + 1);
		}
	}
	decrement(e, t) {
		if (--this.#a, e) {
			let e = this.#o.get(t) ?? 0;
			e === 1 ? this.#o.delete(t) : this.#o.set(t, e - 1);
		}
		this.#m || (this.#m = !0, Je(() => {
			this.#m = !1, this.linked && this.flush();
		}));
	}
	transfer_effects(e, t) {
		for (let t of e) this.#u.add(t);
		for (let e of t) this.#d.add(e);
		e.clear(), t.clear();
	}
	oncommit(e) {
		this.#r.add(e);
	}
	ondiscard(e) {
		this.#i.add(e);
	}
	settled() {
		return (this.#s ??= p()).promise;
	}
	static ensure() {
		if (Ot === null) {
			let t = Ot = new e();
			!Nt && !Mt && Je(() => {
				t.#e || t.flush();
			});
		}
		return Ot;
	}
	apply() {
		At = null;
	}
	schedule(e) {
		if (jt = e, e.b?.is_pending && e.f & 16777228 && !(e.f & 32768)) e.b.defer_effect(e);
		else {
			for (var t = e; t.parent !== null;) {
				t = t.parent;
				var n = t.f;
				if (Pt !== null && t === Yn && (Kn === null || !(Kn.f & 2))) return;
				if (n & 96) {
					if (!(n & 1024)) return;
					t.f ^= h;
				}
			}
			this.#c.push(t);
		}
	}
	#x() {
		if (this.linked) {
			var e = this.#t, t = this.#n;
			e === null || (e.#n = t), t === null ? Dt = e : t.#t = e, this.linked = !1;
		}
	}
};
function zt(e) {
	var t = Mt;
	Mt = !0;
	try {
		var n;
		for (e && (Ot !== null && !Ot.is_fork && Ot.flush(), n = e());;) {
			if (Ye(), Ot === null) return n;
			Ot.flush();
		}
	} finally {
		Mt = t;
	}
}
function Bt() {
	try {
		pe();
	} catch (e) {
		Ze(e, jt);
	}
}
var Vt = null;
function Ht(e) {
	var t = e.length;
	if (t !== 0) {
		for (var n = 0; n < t;) {
			var r = e[n++];
			if (!(r.f & 24576) && cr(r) && (Vt = /* @__PURE__ */ new Set(), pr(r), r.deps === null && r.first === null && r.nodes === null && r.teardown === null && r.ac === null && In(r), Vt?.size > 0)) {
				qt.clear();
				for (let e of Vt) {
					if (e.f & 24576) continue;
					let t = [e], n = e.parent;
					for (; n !== null;) Vt.has(n) && (Vt.delete(n), t.push(n)), n = n.parent;
					for (let e = t.length - 1; e >= 0; e--) {
						let n = t[e];
						n.f & 24576 || pr(n);
					}
				}
				Vt.clear();
			}
		}
		Vt = null;
	}
}
function Ut(e) {
	Ot.schedule(e);
}
function Wt(e, t) {
	if (!(e.f & 32 && e.f & 1024)) {
		e.f & 2048 ? t.d.push(e) : e.f & 4096 && t.m.push(e), $e(e, h);
		for (var n = e.first; n !== null;) Wt(n, t), n = n.next;
	}
}
function Gt(e) {
	$e(e, h);
	for (var t = e.first; t !== null;) Gt(t), t = t.next;
}
//#endregion
//#region node_modules/svelte/src/internal/client/reactivity/sources.js
var Kt = /* @__PURE__ */ new Set(), qt = /* @__PURE__ */ new Map(), Jt = !1;
function Yt(e, t) {
	return {
		f: 0,
		v: e,
		reactions: null,
		equals: Fe,
		rv: 0,
		wv: 0
	};
}
/*#__NO_SIDE_EFFECTS__*/
function I(e, t) {
	let n = Yt(e, t);
	return Qn(n), n;
}
/*#__NO_SIDE_EFFECTS__*/
function Xt(e, t = !1, n = !0) {
	let r = Yt(e);
	return t || (r.equals = Le), r;
}
function L(e, t, n = !1) {
	return Kn !== null && (!qn || Kn.f & 131072) && Ge() && Kn.f & 4325394 && (Zn === null || !Zn.has(e)) && _e(), Zt(e, n ? tn(t) : t, Ft);
}
function Zt(e, t, n = null) {
	if (!e.equals(t)) {
		Wn ? qt.set(e, t) : qt.has(e) || qt.set(e, e.v);
		var r = Rt.ensure();
		if (r.capture(e, t), e.f & 2) {
			let t = e;
			e.f & 2048 && Ct(t), At === null && et(t);
		}
		e.wv = sr(), en(e, g, n), Ge() && Yn !== null && Yn.f & 1024 && !(Yn.f & 96) && (tr === null ? nr([e]) : tr.push(e)), !r.is_fork && Kt.size > 0 && !Jt && Qt();
	}
	return t;
}
function Qt() {
	Jt = !1;
	for (let e of Kt) {
		e.f & 1024 && $e(e, _);
		let t;
		try {
			t = cr(e);
		} catch {
			t = !0;
		}
		t && pr(e);
	}
	Kt.clear();
}
function $t(e) {
	L(e, e.v + 1);
}
function en(e, t, n) {
	var r = e.reactions;
	if (r !== null) for (var i = Ge(), a = r.length, o = 0; o < a; o++) {
		var s = r[o], c = s.f;
		if (i || s !== Yn) {
			var l = (c & g) === 0;
			if (l && $e(s, t), c & 131072) Kt.add(s);
			else if (c & 2) {
				var u = s;
				At?.delete(u), c & 65536 || (c & 512 && (Yn === null || !(Yn.f & 2097152)) && (s.f |= E), en(u, _, n));
			} else if (l) {
				var d = s;
				c & 16 && Vt !== null && Vt.add(d), n === null ? Ut(d) : n.push(d);
			}
		}
	}
}
function tn(t) {
	if (typeof t != "object" || !t || A in t) return t;
	let n = l(t);
	if (n !== s && n !== c) return t;
	var r = /* @__PURE__ */ new Map(), i = e(t), o = /* @__PURE__ */ I(0), u = null, d = ar, f = (e) => {
		if (ar === d) return e();
		var t = Kn, n = ar;
		Jn(null), or(d);
		var r = e();
		return Jn(t), or(n), r;
	};
	return i && r.set("length", /* @__PURE__ */ I(t.length, u)), new Proxy(t, {
		defineProperty(e, t, n) {
			(!("value" in n) || n.configurable === !1 || n.enumerable === !1 || n.writable === !1) && he();
			var i = r.get(t);
			return i === void 0 ? f(() => {
				var e = /* @__PURE__ */ I(n.value, u);
				return r.set(t, e), e;
			}) : L(i, n.value, !0), !0;
		},
		deleteProperty(e, t) {
			var n = r.get(t);
			if (n === void 0) {
				if (t in e) {
					let e = f(() => /* @__PURE__ */ I(be, u));
					r.set(t, e), $t(o);
				}
			} else L(n, be), $t(o);
			return !0;
		},
		get(e, n, i) {
			if (n === A) return t;
			var o = r.get(n), s = n in e;
			if (o === void 0 && (!s || a(e, n)?.writable) && (o = f(() => /* @__PURE__ */ I(tn(s ? e[n] : be), u)), r.set(n, o)), o !== void 0) {
				var c = H(o);
				return c === be ? void 0 : c;
			}
			return Reflect.get(e, n, i);
		},
		getOwnPropertyDescriptor(e, t) {
			var n = Reflect.getOwnPropertyDescriptor(e, t);
			if (n && "value" in n) {
				var i = r.get(t);
				i && (n.value = H(i));
			} else if (n === void 0) {
				var a = r.get(t), o = a?.v;
				if (a !== void 0 && o !== be) return {
					enumerable: !0,
					configurable: !0,
					value: o,
					writable: !0
				};
			}
			return n;
		},
		has(e, t) {
			if (t === A) return !0;
			var n = r.get(t), i = n !== void 0 && n.v !== be || Reflect.has(e, t);
			return (n !== void 0 || Yn !== null && (!i || a(e, t)?.writable)) && (n === void 0 && (n = f(() => /* @__PURE__ */ I(i ? tn(e[t]) : be, u)), r.set(t, n)), H(n) === be) ? !1 : i;
		},
		set(e, t, n, s) {
			var c = r.get(t), l = t in e;
			if (i && t === "length") for (var d = n; d < c.v; d += 1) {
				var p = r.get(d + "");
				p === void 0 ? d in e && (p = f(() => /* @__PURE__ */ I(be, u)), r.set(d + "", p)) : L(p, be);
			}
			if (c === void 0) (!l || a(e, t)?.writable) && (c = f(() => /* @__PURE__ */ I(void 0, u)), L(c, tn(n)), r.set(t, c));
			else {
				l = c.v !== be;
				var m = f(() => tn(n));
				L(c, m);
			}
			var h = Reflect.getOwnPropertyDescriptor(e, t);
			if (h?.set && h.set.call(s, n), !l) {
				if (i && typeof t == "string") {
					var g = r.get("length"), _ = Number(t);
					Number.isInteger(_) && _ >= g.v && L(g, _ + 1);
				}
				$t(o);
			}
			return !0;
		},
		ownKeys(e) {
			H(o);
			var t = Reflect.ownKeys(e).filter((e) => {
				var t = r.get(e);
				return t === void 0 || t.v !== be;
			});
			for (var [n, i] of r) i.v !== be && !(n in e) && t.push(n);
			return t;
		},
		setPrototypeOf() {
			ge();
		}
	});
}
function nn(e) {
	try {
		if (typeof e == "object" && e && A in e) return e[A];
	} catch {}
	return e;
}
function rn(e, t) {
	return Object.is(nn(e), nn(t));
}
var an, on, sn, cn, ln;
function un() {
	if (an === void 0) {
		an = window, on = document, sn = /Firefox/.test(navigator.userAgent);
		var e = Element.prototype, t = Node.prototype, n = Text.prototype;
		cn = a(t, "firstChild").get, ln = a(t, "nextSibling").get, u(e) && (e[te] = void 0, e[ee] = null, e[ne] = void 0, e.__e = void 0), u(n) && (n[re] = void 0);
	}
}
function dn(e = "") {
	return document.createTextNode(e);
}
/*@__NO_SIDE_EFFECTS__*/
function fn(e) {
	return cn.call(e);
}
/*@__NO_SIDE_EFFECTS__*/
function pn(e) {
	return ln.call(e);
}
function R(e, t) {
	if (!N) return /* @__PURE__ */ fn(e);
	var n = /* @__PURE__ */ fn(ke);
	if (n === null) n = ke.appendChild(dn());
	else if (t && n.nodeType !== 3) {
		var r = dn();
		return n?.before(r), Ae(r), r;
	}
	return t && _n(n), Ae(n), n;
}
function z(e, t = !1) {
	if (!N) {
		var n = /* @__PURE__ */ fn(e);
		return n instanceof Comment && n.data === "" ? /* @__PURE__ */ pn(n) : n;
	}
	if (t) {
		if (ke?.nodeType !== 3) {
			var r = dn();
			return ke?.before(r), Ae(r), r;
		}
		_n(ke);
	}
	return ke;
}
function B(e, t = 1, n = !1) {
	let r = N ? ke : e;
	for (var i; t--;) i = r, r = /* @__PURE__ */ pn(r);
	if (!N) return r;
	if (n) {
		if (r?.nodeType !== 3) {
			var a = dn();
			return r === null ? i?.after(a) : r.before(a), Ae(a), a;
		}
		_n(r);
	}
	return Ae(r), r;
}
function mn(e) {
	e.textContent = "";
}
function hn() {
	return !1;
}
function gn(e, t, n) {
	return t == null || t === "http://www.w3.org/1999/xhtml" ? n ? document.createElement(e, { is: n }) : document.createElement(e) : n ? document.createElementNS(t, e, { is: n }) : document.createElementNS(t, e);
}
function _n(e) {
	if (e.nodeValue.length < 65536) return;
	let t = e.nextSibling;
	for (; t !== null && t.nodeType === 3;) t.remove(), e.nodeValue += t.nodeValue, t = e.nextSibling;
}
//#endregion
//#region node_modules/svelte/src/internal/client/reactivity/effects.js
function vn(e) {
	Yn === null && (Kn === null && fe(e), de()), Wn && ue(e);
}
function yn(e, t) {
	var n = t.last;
	n === null ? t.last = t.first = e : (n.next = e, e.prev = n, t.last = e);
}
function bn(e, t) {
	var n = Yn;
	n !== null && n.f & 8192 && (e |= v);
	var r = {
		ctx: Ve,
		deps: null,
		nodes: null,
		f: e | g | 512,
		first: null,
		fn: t,
		last: null,
		next: null,
		parent: n,
		b: n && n.b,
		prev: null,
		teardown: null,
		wv: 0,
		ac: null
	};
	Ot?.register_created_effect(r);
	var i = r;
	if (e & 4) Pt === null ? Rt.ensure().schedule(r) : Pt.push(r);
	else if (t !== null) {
		try {
			pr(r);
		} catch (e) {
			throw Pn(r), e;
		}
		i.deps === null && i.teardown === null && i.nodes === null && i.first === i.last && !(i.f & 524288) && (i = i.first, e & 16 && e & 65536 && i !== null && (i.f |= S));
	}
	if (i !== null && (i.parent = n, n !== null && yn(i, n), Kn !== null && Kn.f & 2 && !(e & 64))) {
		var a = Kn;
		(a.effects ??= []).push(i);
	}
	return r;
}
function xn() {
	return Kn !== null && !qn;
}
function Sn(e) {
	let t = bn(8, null);
	return $e(t, h), t.teardown = e, t;
}
function Cn(e) {
	vn("$effect");
	var t = Yn.f;
	if (!Kn && t & 32 && Ve !== null && !Ve.i) {
		var n = Ve;
		(n.e ??= []).push(e);
	} else return wn(e);
}
function wn(e) {
	return bn(4 | w, e);
}
function Tn(e) {
	Rt.ensure();
	let t = bn(64 | C, e);
	return (e = {}) => new Promise((n) => {
		e.outro ? Ln(t, () => {
			Pn(t), n(void 0);
		}) : (Pn(t), n(void 0));
	});
}
function En(e) {
	return bn(4, e);
}
function Dn(e) {
	return bn(O | C, e);
}
function On(e, t = 0) {
	return bn(8 | t, e);
}
function V(e, t = [], n = [], r = []) {
	mt(r, t, n, (t) => {
		bn(8, () => {
			e(...t.map(H));
		});
	});
}
function kn(e, t = 0) {
	return bn(16 | t, e);
}
function An(e) {
	return bn(32 | C, e);
}
function jn(e) {
	var t = e.teardown;
	if (t !== null) {
		let e = Wn, n = Kn;
		Gn(!0), Jn(null);
		try {
			t.call(null);
		} finally {
			Gn(e), Jn(n);
		}
	}
}
function Mn(e, t = !1) {
	var n = e.first;
	for (e.first = e.last = null; n !== null;) {
		let e = n.ac;
		e !== null && ct(() => {
			e.abort(ae);
		});
		var r = n.next;
		n.f & 64 ? n.parent = null : Pn(n, t), n = r;
	}
}
function Nn(e) {
	for (var t = e.first; t !== null;) {
		var n = t.next;
		t.f & 32 || Pn(t), t = n;
	}
}
function Pn(e, t = !0) {
	var n = !1;
	(t || e.f & 262144) && e.nodes !== null && e.nodes.end !== null && (Fn(e.nodes.start, e.nodes.end), n = !0), e.f |= x, Mn(e, t && !n), fr(e, 0);
	var r = e.nodes && e.nodes.t;
	if (r !== null) for (let e of r) e.stop();
	jn(e), e.f ^= x, e.f |= y;
	var i = e.parent;
	i !== null && i.first !== null && In(e), e.next = e.prev = e.teardown = e.ctx = e.deps = e.fn = e.nodes = e.ac = e.b = null;
}
function Fn(e, t) {
	for (; e !== null;) {
		var n = e === t ? null : /* @__PURE__ */ pn(e);
		e.remove(), e = n;
	}
}
function In(e) {
	var t = e.parent, n = e.prev, r = e.next;
	n !== null && (n.next = r), r !== null && (r.prev = n), t !== null && (t.first === e && (t.first = r), t.last === e && (t.last = n));
}
function Ln(e, t, n = !0) {
	var r = [];
	Rn(e, r, !0);
	var i = () => {
		n && Pn(e), t && t();
	}, a = r.length;
	if (a > 0) {
		var o = () => --a || i();
		for (var s of r) s.out(o);
	} else i();
}
function Rn(e, t, n) {
	if (!(e.f & 8192)) {
		e.f ^= v;
		var r = e.nodes && e.nodes.t;
		if (r !== null) for (let e of r) (e.is_global || n) && t.push(e);
		for (var i = e.first; i !== null;) {
			var a = i.next;
			if (!(i.f & 64)) {
				var o = !!(i.f & 65536) || !!(i.f & 32) && !!(e.f & 16);
				Rn(i, t, o ? n : !1);
			}
			i = a;
		}
	}
}
function zn(e) {
	Bn(e, !0);
}
function Bn(e, t) {
	if (e.f & 8192) {
		e.f ^= v, e.f & 1024 || ($e(e, g), Rt.ensure().schedule(e));
		for (var n = e.first; n !== null;) {
			var r = n.next, i = !!(n.f & 65536) || !!(n.f & 32);
			Bn(n, i ? t : !1), n = r;
		}
		var a = e.nodes && e.nodes.t;
		if (a !== null) for (let e of a) (e.is_global || t) && e.in();
	}
}
function Vn(e, t) {
	if (e.nodes) for (var n = e.nodes.start, r = e.nodes.end; n !== null;) {
		var i = n === r ? null : /* @__PURE__ */ pn(n);
		t.append(n), n = i;
	}
}
//#endregion
//#region node_modules/svelte/src/internal/client/legacy.js
var Hn = null, Un = !1, Wn = !1;
function Gn(e) {
	Wn = e;
}
var Kn = null, qn = !1;
function Jn(e) {
	Kn = e;
}
var Yn = null;
function Xn(e) {
	Yn = e;
}
var Zn = null;
function Qn(e) {
	Kn !== null && (Zn ??= /* @__PURE__ */ new Set()).add(e);
}
var $n = null, er = 0, tr = null;
function nr(e) {
	tr = e;
}
var rr = 1, ir = 0, ar = ir;
function or(e) {
	ar = e;
}
function sr() {
	return ++rr;
}
function cr(e) {
	var t = e.f;
	if (t & 2048) return !0;
	if (t & 2 && (e.f &= ~E), t & 4096) {
		for (var n = e.deps, r = n.length, i = 0; i < r; i++) {
			var a = n[i];
			if (cr(a) && wt(a), a.wv > e.wv) return !0;
		}
		t & 512 && At === null && $e(e, h);
	}
	return !1;
}
function lr(e, t, n = !0) {
	var r = e.reactions;
	if (r !== null && !(Zn !== null && Zn.has(e))) for (var i = 0; i < r.length; i++) {
		var a = r[i];
		a.f & 2 ? lr(a, t, !1) : t === a && (n ? $e(a, g) : a.f & 1024 && $e(a, _), Ut(a));
	}
}
function ur(e) {
	var t = $n, n = er, r = tr, i = Kn, a = Zn, o = Ve, s = qn, c = ar, l = e.f;
	$n = null, er = 0, tr = null, Kn = l & 96 ? null : e, Zn = null, He(e.ctx), qn = !1, ar = ++ir, e.ac !== null && (ct(() => {
		e.ac.abort(ae);
	}), e.ac = null);
	try {
		e.f |= D;
		var u = e.fn, d = u();
		e.f |= b;
		var f = e.deps, p = Ot?.is_fork;
		if ($n !== null) {
			var m;
			if (p || fr(e, er), f !== null && er > 0) for (f.length = er + $n.length, m = 0; m < $n.length; m++) f[er + m] = $n[m];
			else e.deps = f = $n;
			if (xn() && e.f & 512) for (m = er; m < f.length; m++) (f[m].reactions ??= []).push(e);
		} else !p && f !== null && er < f.length && (fr(e, er), f.length = er);
		if (Ge() && tr !== null && !qn && f !== null && !(e.f & 6146)) for (m = 0; m < tr.length; m++) lr(tr[m], e);
		if (i !== null && i !== e) {
			if (ir++, i.deps !== null) for (let e = 0; e < n; e += 1) i.deps[e].rv = ir;
			if (t !== null) for (let e of t) e.rv = ir;
			tr !== null && (r === null ? r = tr : r.push(...tr));
		}
		return e.f & 8388608 && (e.f ^= k), d;
	} catch (e) {
		return Xe(e);
	} finally {
		e.f ^= D, $n = t, er = n, tr = r, Kn = i, Zn = a, He(o), qn = s, ar = c;
	}
}
function dr(e, r) {
	let i = r.reactions;
	if (i !== null) {
		var a = t.call(i, e);
		if (a !== -1) {
			var o = i.length - 1;
			o === 0 ? i = r.reactions = null : (i[a] = i[o], i.pop());
		}
	}
	if (i === null && r.f & 2 && ($n === null || !n.call($n, r))) {
		var s = r;
		s.f & 512 && (s.f ^= 512, s.f &= ~E), s.v !== be && et(s), s.ac !== null && ct(() => {
			s.ac.abort(ae), s.ac = null, $e(s, g);
		}), Tt(s), fr(s, 0);
	}
}
function fr(e, t) {
	var n = e.deps;
	if (n !== null) for (var r = t; r < n.length; r++) dr(e, n[r]);
}
function pr(e) {
	var t = e.f;
	if (!(t & 16384)) {
		$e(e, h);
		var n = Yn, r = Un;
		Yn = e, Un = !(t & 96);
		try {
			t & 16777232 ? Nn(e) : Mn(e), jn(e);
			var i = ur(e);
			e.teardown = typeof i == "function" ? i : null, e.wv = rr;
		} finally {
			Un = r, Yn = n;
		}
	}
}
async function mr() {
	await Promise.resolve(), zt();
}
function H(e) {
	var t = !!(e.f & 2);
	if (Hn?.add(e), Kn !== null && !qn && !(Yn !== null && Yn.f & 16384) && (Zn === null || !Zn.has(e))) {
		var r = Kn.deps;
		if (Kn.f & 2097152) e.rv < ir && (e.rv = ir, $n === null && r !== null && r[er] === e ? er++ : $n === null ? $n = [e] : $n.push(e));
		else {
			Kn.deps ??= [], n.call(Kn.deps, e) || Kn.deps.push(e);
			var i = e.reactions;
			i === null ? e.reactions = [Kn] : n.call(i, Kn) || i.push(Kn);
		}
	}
	if (Wn && qt.has(e)) return qt.get(e);
	if (t) {
		var a = e;
		if (Wn) {
			var o = a.v;
			return (!(a.f & 1024) && a.reactions !== null || gr(a)) && (o = Ct(a)), qt.set(a, o), o;
		}
		var s = !(a.f & 512) && !qn && Kn !== null && (Un || !!(Kn.f & 512)), c = (a.f & b) === 0;
		cr(a) && (s && (a.f |= 512), wt(a)), s && !c && (Et(a), hr(a));
	}
	if (At?.has(e)) return At.get(e);
	if (e.f & 8388608) throw e.v;
	return e.v;
}
function hr(e) {
	if (e.f |= 512, e.deps !== null) for (let t of e.deps) (t.reactions ??= []).push(e), t.f & 2 && !(t.f & 512) && (Et(t), hr(t));
}
function gr(e) {
	if (e.v === be) return !0;
	if (e.deps === null) return !1;
	for (let t of e.deps) if (qt.has(t) || t.f & 2 && gr(t)) return !0;
	return !1;
}
function _r(e) {
	var t = qn;
	try {
		return qn = !0, e();
	} finally {
		qn = t;
	}
}
function vr(e) {
	if (!(typeof e != "object" || !e || e instanceof EventTarget)) {
		if (A in e) yr(e);
		else if (!Array.isArray(e)) for (let t in e) {
			let n = e[t];
			typeof n == "object" && n && A in n && yr(n);
		}
	}
}
function yr(e, t = /* @__PURE__ */ new Set()) {
	if (typeof e == "object" && e && !(e instanceof EventTarget) && !t.has(e)) {
		t.add(e), e instanceof Date && e.getTime();
		for (let n in e) try {
			yr(e[n], t);
		} catch {}
		let n = l(e);
		if (n !== Object.prototype && n !== Array.prototype && n !== Map.prototype && n !== Set.prototype && n !== Date.prototype) {
			let t = o(n);
			for (let n in t) {
				let r = t[n].get;
				if (r) try {
					r.call(e);
				} catch {}
			}
		}
	}
}
[.../* @__PURE__ */ "allowfullscreen.async.autofocus.autoplay.checked.controls.default.disabled.formnovalidate.indeterminate.inert.ismap.loop.multiple.muted.nomodule.novalidate.open.playsinline.readonly.required.reversed.seamless.selected.webkitdirectory.defer.disablepictureinpicture.disableremoteplayback".split(".")];
var br = ["touchstart", "touchmove"];
function xr(e) {
	return br.includes(e);
}
//#endregion
//#region node_modules/svelte/src/internal/client/dom/elements/events.js
var Sr = Symbol("events"), Cr = /* @__PURE__ */ new Set(), wr = /* @__PURE__ */ new Set();
function Tr(e, t, n, r = {}) {
	function i(e) {
		if (r.capture || kr.call(t, e), !e.cancelBubble) return ct(() => n?.call(this, e));
	}
	return e.startsWith("pointer") || e.startsWith("touch") || e === "wheel" ? Je(() => {
		t.addEventListener(e, i, r);
	}) : t.addEventListener(e, i, r), i;
}
function U(e, t, n, r, i) {
	var a = {
		capture: r,
		passive: i
	}, o = Tr(e, t, n, a);
	(t === document.body || t === window || t === document || t instanceof HTMLMediaElement) && Sn(() => {
		t.removeEventListener(e, o, a);
	});
}
function W(e, t, n) {
	(t[Sr] ??= {})[e] = n;
}
function Er(e) {
	for (var t = 0; t < e.length; t++) Cr.add(e[t]);
	for (var n of wr) n(e);
}
var Dr = null, Or = !1;
function kr(e) {
	var t = this, n = t.ownerDocument, r = e.type, a = e.composedPath?.() || [], o = a[0] || e.target;
	Dr = e, Or || (Or = !0, setTimeout(() => {
		Or = !1, Dr = null;
	}));
	var s = 0, c = Dr === e && e[Sr];
	if (c) {
		var l = a.indexOf(c);
		if (l !== -1 && (t === document || t === window)) {
			e[Sr] = t;
			return;
		}
		var u = a.indexOf(t);
		if (u === -1) return;
		l <= u && (s = l);
	}
	if (o = a[s] || e.target, o !== t) {
		i(e, "currentTarget", {
			configurable: !0,
			get() {
				return o || n;
			}
		});
		var d = Kn, f = Yn;
		Jn(null), Xn(null);
		try {
			for (var p, m = []; o !== null && o !== t;) {
				try {
					var h = o[Sr]?.[r];
					h != null && (!o.disabled || e.target === o) && h.call(o, e);
				} catch (e) {
					p ? m.push(e) : p = e;
				}
				if (e.cancelBubble) break;
				s++, o = s < a.length ? a[s] : null;
			}
			if (p) {
				for (let e of m) queueMicrotask(() => {
					throw e;
				});
				throw p;
			}
		} finally {
			e[Sr] = t, delete e.currentTarget, Jn(d), Xn(f);
		}
	}
}
//#endregion
//#region node_modules/svelte/src/internal/client/dom/reconciler.js
var Ar = globalThis?.window?.trustedTypes && /* @__PURE__ */ globalThis.window.trustedTypes.createPolicy("svelte-trusted-html", { createHTML: (e) => e });
function jr(e) {
	return Ar?.createHTML(e) ?? e;
}
function Mr(e) {
	var t = gn("template");
	return t.innerHTML = jr(e.replaceAll("<!>", "<!---->")), t.content;
}
//#endregion
//#region node_modules/svelte/src/internal/client/dom/template.js
function Nr(e, t) {
	var n = Yn;
	n.nodes === null && (n.nodes = {
		start: e,
		end: t,
		a: null,
		t: null
	});
}
/*#__NO_SIDE_EFFECTS__*/
function G(e, t) {
	var n = !!(t & 1), r = !!(t & 2), i, a = !e.startsWith("<!>");
	return () => {
		if (N) return Nr(ke, null), ke;
		i === void 0 && (i = Mr(a ? e : "<!>" + e), n || (i = /* @__PURE__ */ fn(i)));
		var t = r || sn ? document.importNode(i, !0) : i.cloneNode(!0);
		if (n) {
			var o = /* @__PURE__ */ fn(t), s = t.lastChild;
			Nr(o, s);
		} else Nr(t, t);
		return t;
	};
}
/*#__NO_SIDE_EFFECTS__*/
function Pr(e, t, n = "svg") {
	var r = !e.startsWith("<!>"), i = !!(t & 1), a = `<${n}>${r ? e : "<!>" + e}</${n}>`, o;
	return () => {
		if (N) return Nr(ke, null), ke;
		if (!o) {
			var e = /* @__PURE__ */ fn(Mr(a));
			if (i) for (o = document.createDocumentFragment(); /* @__PURE__ */ fn(e);) o.appendChild(/* @__PURE__ */ fn(e));
			else o = /* @__PURE__ */ fn(e);
		}
		var t = o.cloneNode(!0);
		if (i) {
			var n = /* @__PURE__ */ fn(t), r = t.lastChild;
			Nr(n, r);
		} else Nr(t, t);
		return t;
	};
}
/*#__NO_SIDE_EFFECTS__*/
function Fr(e, t) {
	return /* @__PURE__ */ Pr(e, t, "svg");
}
function Ir(e = "") {
	if (!N) {
		var t = dn(e + "");
		return Nr(t, t), t;
	}
	var n = ke;
	return n.nodeType === 3 ? _n(n) : (n.before(n = dn()), Ae(n)), Nr(n, n), n;
}
function Lr() {
	if (N) return Nr(ke, null), ke;
	var e = document.createDocumentFragment(), t = document.createComment(""), n = dn();
	return e.append(t, n), Nr(t, n), e;
}
function K(e, t) {
	if (N) {
		var n = Yn;
		(!(n.f & 32768) || n.nodes.end === null) && (n.nodes.end = ke), je();
	} else e !== null && e.before(t);
}
function Rr() {
	if (N && ke && ke.nodeType === 8 && ke.textContent?.startsWith("$")) {
		let e = ke.textContent.substring(1);
		return je(), e;
	}
	return (window.__svelte ??= {}).uid ??= 1, `c${window.__svelte.uid++}`;
}
function q(e, t) {
	var n = t == null ? "" : typeof t == "object" ? `${t}` : t;
	n !== (e[re] ??= e.nodeValue) && (e[re] = n, e.nodeValue = `${n}`);
}
function zr(e, t) {
	return Vr(e, t);
}
var Br = /* @__PURE__ */ new Map();
function Vr(e, { target: t, anchor: n, props: i = {}, events: a, context: o, intro: s = !0, transformError: c }) {
	un();
	var l = void 0, u = Tn(() => {
		var s = n ?? t.appendChild(dn());
		ft(s, { pending: () => {} }, (t) => {
			Ue({});
			var n = Ve;
			if (o && (n.c = o), a && (i.$$events = a), N && Nr(t, null), l = e(t, i) || {}, N && (Yn.nodes.end = ke, ke === null || ke.nodeType !== 8 || ke.data !== "]")) throw Te(), ye;
			We();
		}, c);
		var u = /* @__PURE__ */ new Set(), d = (e) => {
			for (var n = 0; n < e.length; n++) {
				var r = e[n];
				if (!u.has(r)) {
					u.add(r);
					var i = xr(r);
					for (let e of [t, document]) {
						var a = Br.get(e);
						a === void 0 && (a = /* @__PURE__ */ new Map(), Br.set(e, a));
						var o = a.get(r);
						o === void 0 ? (e.addEventListener(r, kr, { passive: i }), a.set(r, 1)) : a.set(r, o + 1);
					}
				}
			}
		};
		return d(r(Cr)), wr.add(d), () => {
			for (var e of u) for (let n of [t, document]) {
				var r = Br.get(n), i = r.get(e);
				--i == 0 ? (n.removeEventListener(e, kr), r.delete(e), r.size === 0 && Br.delete(n)) : r.set(e, i);
			}
			wr.delete(d), s !== n && s.parentNode?.removeChild(s);
		};
	});
	return Hr.set(l, u), l;
}
var Hr = /* @__PURE__ */ new WeakMap();
function Ur(e, t) {
	let n = Hr.get(e);
	return n ? (Hr.delete(e), n(t)) : Promise.resolve();
}
//#endregion
//#region node_modules/svelte/src/internal/client/dom/blocks/branches.js
var Wr = class {
	anchor;
	#e = /* @__PURE__ */ new Map();
	#t = /* @__PURE__ */ new Map();
	#n = /* @__PURE__ */ new Map();
	#r = /* @__PURE__ */ new Set();
	#i = !0;
	constructor(e, t = !0) {
		this.anchor = e, this.#i = t;
	}
	#a = (e) => {
		if (this.#e.has(e)) {
			var t = this.#e.get(e), n = this.#t.get(t);
			if (n) zn(n), this.#r.delete(t);
			else {
				var r = this.#n.get(t);
				r && (zn(r.effect), this.#t.set(t, r.effect), this.#n.delete(t), r.fragment.lastChild.remove(), this.anchor.before(r.fragment), n = r.effect);
			}
			for (let [t, n] of this.#e) {
				if (this.#e.delete(t), t === e) break;
				let r = this.#n.get(n);
				r && (Pn(r.effect), this.#n.delete(n));
			}
			for (let [e, r] of this.#t) {
				if (e === t || this.#r.has(e)) continue;
				let i = () => {
					if (Array.from(this.#e.values()).includes(e)) {
						var t = document.createDocumentFragment();
						Vn(r, t), t.append(dn()), this.#n.set(e, {
							effect: r,
							fragment: t
						});
					} else Pn(r);
					this.#r.delete(e), this.#t.delete(e);
				};
				this.#i || !n ? (this.#r.add(e), Ln(r, i, !1)) : i();
			}
		}
	};
	#o = (e) => {
		this.#e.delete(e);
		let t = Array.from(this.#e.values());
		for (let [e, n] of this.#n) t.includes(e) || (Pn(n.effect), this.#n.delete(e));
	};
	ensure(e, t) {
		var n = Ot, r = hn();
		if (t && !this.#t.has(e) && !this.#n.has(e)) {
			if (r) {
				var i = document.createDocumentFragment(), a = dn();
				i.append(a), this.#n.set(e, {
					effect: An(() => t(a)),
					fragment: i
				});
			} else this.#t.set(e, An(() => t(this.anchor)));
		}
		if (this.#e.set(n, e), r) {
			for (let [t, r] of this.#t) t === e ? n.unskip_effect(r) : n.skip_effect(r);
			for (let [t, r] of this.#n) t === e ? n.unskip_effect(r.effect) : n.skip_effect(r.effect);
			n.oncommit(this.#a), n.ondiscard(this.#o);
		} else N && (this.anchor = ke), this.#a(n);
	}
};
//#endregion
//#region node_modules/svelte/src/internal/client/dom/blocks/if.js
function J(e, t, n = !1) {
	var r;
	N && (r = ke, je());
	var i = new Wr(e), a = n ? S : 0;
	function o(e, t) {
		if (N) {
			var n = Pe(r);
			if (e !== parseInt(n.substring(1))) {
				var a = Ne();
				Ae(a), i.anchor = a, Oe(!1), i.ensure(e, t), Oe(!0);
				return;
			}
		}
		i.ensure(e, t);
	}
	kn(() => {
		var e = !1;
		t((t, n = 0) => {
			e = !0, o(n, t);
		}), e || o(-1, null);
	}, a);
}
//#endregion
//#region node_modules/svelte/src/internal/client/dom/blocks/key.js
var Gr = Symbol("NaN");
function Kr(e, t, n) {
	N && je();
	var r = new Wr(e), i = !Ge();
	kn(() => {
		var e = t();
		e !== e && (e = Gr), i && typeof e == "object" && e && (e = {}), r.ensure(e, n);
	});
}
//#endregion
//#region node_modules/svelte/src/internal/client/dom/blocks/each.js
function qr(e, t) {
	return t;
}
function Jr(e, t, n) {
	for (var i = [], a = t.length, o, s = t.length, c = 0; c < a; c++) {
		let n = t[c];
		Ln(n, () => {
			if (o) {
				if (o.pending.delete(n), o.done.add(n), o.pending.size === 0) {
					var t = e.outrogroups;
					Yr(e, r(o.done)), t.delete(o), t.size === 0 && (e.outrogroups = null);
				}
			} else --s;
		}, !1);
	}
	if (s === 0) {
		var l = i.length === 0 && n !== null && e.pending.size === 0;
		if (l) {
			var u = n, d = u.parentNode;
			mn(d), d.append(u), e.items.clear();
		}
		Yr(e, t, !l);
	} else o = {
		pending: new Set(t),
		done: /* @__PURE__ */ new Set()
	}, (e.outrogroups ??= /* @__PURE__ */ new Set()).add(o);
}
function Yr(e, t, n = !0) {
	var r;
	if (e.pending.size > 0) {
		r = /* @__PURE__ */ new Set();
		for (let t of e.pending.values()) for (let n of t) r.add(e.items.get(n).e);
	}
	for (var i = 0; i < t.length; i++) {
		var a = t[i];
		r?.has(a) ? (a.f |= T, Vn(a, document.createDocumentFragment())) : Pn(t[i], n);
	}
}
var Xr;
function Y(t, n, i, a, o, s = null) {
	var c = t, l = /* @__PURE__ */ new Map();
	if (n & 4) {
		var u = t;
		c = N ? Ae(/* @__PURE__ */ fn(u)) : u.appendChild(dn());
	}
	N && je();
	var d = null, f = /* @__PURE__ */ xt(() => {
		var t = i();
		return e(t) ? t : t == null ? [] : r(t);
	}), p, m = /* @__PURE__ */ new Map(), h = !0;
	function g(e) {
		v.effect.f & 16384 || (v.pending.delete(e), v.fallback = d, Qr(v, p, c, n, a), d !== null && (p.length === 0 ? d.f & 33554432 ? (d.f ^= T, ei(d, null, c)) : zn(d) : Ln(d, () => {
			d = null;
		})));
	}
	function _(e) {
		v.pending.delete(e);
	}
	var v = {
		effect: kn(() => {
			p = H(f);
			var e = p.length;
			let t = !1;
			N && Pe(c) === "[!" != (e === 0) && (c = Ne(), Ae(c), Oe(!1), t = !0);
			for (var r = /* @__PURE__ */ new Set(), u = Ot, v = hn(), y = 0; y < e; y += 1) {
				N && ke.nodeType === 8 && ke.data === "]" && (c = ke, t = !0, Oe(!1));
				var b = p[y], x = a(b, y), S = h ? null : l.get(x);
				S ? (S.v && Zt(S.v, b), S.i && Zt(S.i, y), v && u.unskip_effect(S.e)) : (S = $r(l, h ? c : Xr ??= dn(), b, x, y, o, n, i), h || (S.e.f |= T), l.set(x, S)), r.add(x);
			}
			if (e === 0 && s && !d && (h ? d = An(() => s(c)) : (d = An(() => s(Xr ??= dn())), d.f |= T)), e > r.size && le("", "", ""), N && e > 0 && Ae(Ne()), !h) {
				if (m.set(u, r), v) {
					for (let [e, t] of l) r.has(e) || u.skip_effect(t.e);
					u.oncommit(g), u.ondiscard(_);
				} else g(u);
			}
			t && Oe(!0), H(f);
		}),
		flags: n,
		items: l,
		pending: m,
		outrogroups: null,
		fallback: d
	};
	h = !1, N && (c = ke);
}
function Zr(e) {
	for (; e !== null && !(e.f & 32);) e = e.next;
	return e;
}
function Qr(e, t, n, i, a) {
	var o = !!(i & 8), s = t.length, c = e.items, l = Zr(e.effect.first), u, d = null, f, p = [], m = [], h, g, _, v;
	if (o) for (v = 0; v < s; v += 1) h = t[v], g = a(h, v), _ = c.get(g).e, _.f & 33554432 || (_.nodes?.a?.measure(), (f ??= /* @__PURE__ */ new Set()).add(_));
	for (v = 0; v < s; v += 1) {
		if (h = t[v], g = a(h, v), _ = c.get(g).e, e.outrogroups !== null) for (let t of e.outrogroups) t.pending.delete(_), t.done.delete(_);
		if (_.f & 8192 && (zn(_), o && (_.nodes?.a?.unfix(), (f ??= /* @__PURE__ */ new Set()).delete(_))), _.f & 33554432) {
			if (_.f ^= T, _ === l) ei(_, null, n);
			else {
				var y = d ? d.next : l;
				_ === e.effect.last && (e.effect.last = _.prev), _.prev && (_.prev.next = _.next), _.next && (_.next.prev = _.prev), ti(e, d, _), ti(e, _, y), ei(_, y, n), d = _, p = [], m = [], l = Zr(d.next);
				continue;
			}
		}
		if (_ !== l) {
			if (u !== void 0 && u.has(_)) {
				if (p.length < m.length) {
					var b = m[0], x;
					d = b.prev;
					var S = p[0], C = p[p.length - 1];
					for (x = 0; x < p.length; x += 1) ei(p[x], b, n);
					for (x = 0; x < m.length; x += 1) u.delete(m[x]);
					ti(e, S.prev, C.next), ti(e, d, S), ti(e, C, b), l = b, d = C, --v, p = [], m = [];
				} else u.delete(_), ei(_, l, n), ti(e, _.prev, _.next), ti(e, _, d === null ? e.effect.first : d.next), ti(e, d, _), d = _;
				continue;
			}
			for (p = [], m = []; l !== null && l !== _;) (u ??= /* @__PURE__ */ new Set()).add(l), m.push(l), l = Zr(l.next);
			if (l === null) continue;
		}
		_.f & 33554432 || p.push(_), d = _, l = Zr(_.next);
	}
	if (e.outrogroups !== null) {
		for (let t of e.outrogroups) t.pending.size === 0 && (Yr(e, r(t.done)), e.outrogroups?.delete(t));
		e.outrogroups.size === 0 && (e.outrogroups = null);
	}
	if (l !== null || u !== void 0) {
		var w = [];
		if (u !== void 0) for (_ of u) _.f & 8192 || w.push(_);
		for (; l !== null;) !(l.f & 8192) && l !== e.fallback && w.push(l), l = Zr(l.next);
		var E = w.length;
		if (E > 0) {
			var D = i & 4 && s === 0 ? n : null;
			if (o) {
				for (v = 0; v < E; v += 1) w[v].nodes?.a?.measure();
				for (v = 0; v < E; v += 1) w[v].nodes?.a?.fix();
			}
			Jr(e, w, D);
		}
	}
	o && Je(() => {
		if (f !== void 0) for (_ of f) _.nodes?.a?.apply();
	});
}
function $r(e, t, n, r, i, a, o, s) {
	var c = o & 1 ? o & 16 ? Yt(n) : /* @__PURE__ */ Xt(n, !1, !1) : null, l = o & 2 ? Yt(i) : null;
	return {
		v: c,
		i: l,
		e: An(() => (a(t, c ?? n, l ?? i, s), () => {
			e.delete(r);
		}))
	};
}
function ei(e, t, n) {
	if (e.nodes) for (var r = e.nodes.start, i = e.nodes.end, a = t && !(t.f & 33554432) ? t.nodes.start : n; r !== null;) {
		var o = /* @__PURE__ */ pn(r);
		if (a.before(r), r === i) return;
		r = o;
	}
}
function ti(e, t, n) {
	t === null ? e.effect.first = n : t.next = n, n === null ? e.effect.last = t : n.prev = t;
}
function ni(e, t, n = !1, r = !1, i = !1, a = !1) {
	var o = e, s = "";
	if (n) {
		var c = e;
		N && (o = Ae(/* @__PURE__ */ fn(c)));
	}
	V(() => {
		var e = Yn;
		if (s === (s = t() ?? "")) N && je();
		else if (n && !N) e.nodes = null, c.innerHTML = s, s !== "" && Nr(/* @__PURE__ */ fn(c), c.lastChild);
		else if (e.nodes !== null && (Fn(e.nodes.start, e.nodes.end), e.nodes = null), s !== "") {
			if (N) {
				for (var a = ke.data, l = je(), u = l; l !== null && (l.nodeType !== 8 || l.data !== "");) u = l, l = /* @__PURE__ */ pn(l);
				if (l === null) throw Te(), ye;
				Nr(ke, u), o = Ae(l);
			} else {
				var d = gn(r ? "svg" : i ? "math" : "template", r ? Se : i ? Ce : void 0);
				d.innerHTML = s;
				var f = r || i ? d : d.content;
				if (Nr(/* @__PURE__ */ fn(f), f.lastChild), r || i) for (; /* @__PURE__ */ fn(f);) o.before(/* @__PURE__ */ fn(f));
				else o.before(f);
			}
		}
	});
}
//#endregion
//#region node_modules/svelte/src/internal/client/dom/blocks/snippet.js
function ri(e, t, ...n) {
	var r = new Wr(e);
	kn(() => {
		let e = t() ?? null;
		r.ensure(e, e && ((t) => e(t, ...n)));
	}, S);
}
//#endregion
//#region node_modules/svelte/src/internal/client/dom/elements/actions.js
function ii(e, t, n) {
	En(() => {
		var r = _r(() => t(e, n?.()) || {});
		if (n && r?.update) {
			var i = !1, a = {};
			On(() => {
				var e = n();
				vr(e), i && Ie(a, e) && (a = e, r.update(e));
			}), i = !0;
		}
		if (r?.destroy) return () => r.destroy();
	});
}
//#endregion
//#region node_modules/clsx/dist/clsx.mjs
function ai(e) {
	var t, n, r = "";
	if (typeof e == "string" || typeof e == "number") r += e;
	else if (typeof e == "object") {
		if (Array.isArray(e)) {
			var i = e.length;
			for (t = 0; t < i; t++) e[t] && (n = ai(e[t])) && (r && (r += " "), r += n);
		} else for (n in e) e[n] && (r && (r += " "), r += n);
	}
	return r;
}
function oi() {
	for (var e, t, n = 0, r = "", i = arguments.length; n < i; n++) (e = arguments[n]) && (t = ai(e)) && (r && (r += " "), r += t);
	return r;
}
//#endregion
//#region node_modules/svelte/src/internal/shared/attributes.js
function si(e) {
	return typeof e == "object" ? oi(e) : e ?? "";
}
var ci = [..." 	\n\r\f\xA0\v﻿"];
function li(e, t, n) {
	var r = e == null ? "" : "" + e;
	if (t && (r = r ? r + " " + t : t), n) {
		for (var i of Object.keys(n)) if (n[i]) r = r ? r + " " + i : i;
		else if (r.length) for (var a = i.length, o = 0; (o = r.indexOf(i, o)) >= 0;) {
			var s = o + a;
			(o === 0 || ci.includes(r[o - 1])) && (s === r.length || ci.includes(r[s])) ? r = (o === 0 ? "" : r.substring(0, o)) + r.substring(s + 1) : o = s;
		}
	}
	return r === "" ? null : r;
}
function ui(e, t = !1) {
	var n = t ? " !important;" : ";", r = "";
	for (var i of Object.keys(e)) {
		var a = e[i];
		a != null && a !== "" && (r += " " + i + ": " + a + n);
	}
	return r;
}
function di(e) {
	return e[0] !== "-" || e[1] !== "-" ? e.toLowerCase() : e;
}
function fi(e, t) {
	if (t) {
		var n = "", r, i;
		if (Array.isArray(t) ? (r = t[0], i = t[1]) : r = t, e) {
			e = String(e).replaceAll(/\/\*.*?\*\//g, "").trim();
			var a = !1, o = 0, s = !1, c = [];
			r && c.push(...Object.keys(r).map(di)), i && c.push(...Object.keys(i).map(di));
			var l = 0, u = -1;
			let t = e.length;
			for (var d = 0; d < t; d++) {
				var f = e[d];
				if (s ? f === "/" && e[d - 1] === "*" && (s = !1) : a ? a === f && (a = !1) : f === "/" && e[d + 1] === "*" ? s = !0 : f === "\"" || f === "'" ? a = f : f === "(" ? o++ : f === ")" && o--, !s && a === !1 && o === 0) {
					if (f === ":" && u === -1) u = d;
					else if (f === ";" || d === t - 1) {
						if (u !== -1) {
							var p = di(e.substring(l, u).trim());
							if (!c.includes(p)) {
								f !== ";" && d++;
								var m = e.substring(l, d).trim();
								n += " " + m + ";";
							}
						}
						l = d + 1, u = -1;
					}
				}
			}
		}
		return r && (n += ui(r)), i && (n += ui(i, !0)), n = n.trim(), n === "" ? null : n;
	}
	return e == null ? null : String(e);
}
//#endregion
//#region node_modules/svelte/src/internal/client/dom/elements/class.js
function pi(e, t, n, r, i, a) {
	var o = e[te];
	if (N || o !== n || o === void 0) {
		var s = li(n, r, a);
		(!N || s !== e.getAttribute("class")) && (s == null ? e.removeAttribute("class") : t ? e.className = s : e.setAttribute("class", s)), e[te] = n;
	} else if (a && i !== a) for (var c in a) {
		var l = !!a[c];
		(i == null || l !== !!i[c]) && e.classList.toggle(c, l);
	}
	return a;
}
//#endregion
//#region node_modules/svelte/src/internal/client/dom/elements/style.js
function mi(e, t = {}, n, r) {
	for (var i in n) {
		var a = n[i];
		t[i] !== a && (n[i] == null ? e.style.removeProperty(i) : e.style.setProperty(i, a, r));
	}
}
function hi(e, t, n, r) {
	var i = e[ne];
	if (N || i !== t) {
		var a = fi(t, r);
		(!N || a !== e.getAttribute("style")) && (a == null ? e.removeAttribute("style") : e.style.cssText = a), e[ne] = t;
	} else r && (Array.isArray(r) ? (mi(e, n?.[0], r[0]), mi(e, n?.[1], r[1], "important")) : mi(e, n, r));
	return r;
}
//#endregion
//#region node_modules/svelte/src/internal/client/dom/elements/bindings/select.js
function gi(t, n, r = !1) {
	if (t.multiple) {
		if (n == null) return;
		if (!e(n)) return Ee();
		for (var i of t.options) i.selected = n.includes(yi(i));
	} else {
		for (i of t.options) if (rn(yi(i), n)) {
			i.selected = !0;
			return;
		}
		(!r || n !== void 0) && (t.selectedIndex = -1);
	}
}
function _i(e) {
	var t = new MutationObserver(() => {
		"__value" in e && gi(e, e.__value);
	});
	t.observe(e, {
		childList: !0,
		subtree: !0,
		attributes: !0,
		attributeFilter: ["value"]
	}), Sn(() => {
		t.disconnect();
	});
}
function vi(e, t, n = t) {
	var r = /* @__PURE__ */ new WeakSet(), i = !0;
	lt(e, "change", (t) => {
		var i = t ? "[selected]" : ":checked", a;
		if (e.multiple) a = [].map.call(e.querySelectorAll(i), yi);
		else {
			var o = e.querySelector(i) ?? e.querySelector("option:not([disabled])");
			a = o && yi(o);
		}
		n(a), e.__value = a, Ot !== null && r.add(Ot);
	}), En(() => {
		var a = t();
		if (e === document.activeElement) {
			var o = Ot;
			if (r.has(o)) return;
		}
		if (gi(e, a, i), i && a === void 0) {
			var s = e.querySelector(":checked");
			s !== null && (a = yi(s), n(a));
		}
		e.__value = a, i = !1;
	}), _i(e);
}
function yi(e) {
	return "__value" in e ? e.__value : e.value;
}
//#endregion
//#region node_modules/svelte/src/internal/client/dom/elements/attributes.js
var bi = Symbol("is custom element"), xi = Symbol("is html"), Si = oe ? "link" : "LINK", Ci = oe ? "progress" : "PROGRESS";
function X(e) {
	if (N) {
		var t = !1, n = () => {
			if (!t) {
				if (t = !0, e.hasAttribute("value")) {
					var n = e.value;
					Z(e, "value", null), e.value = n;
				}
				if (e.hasAttribute("checked")) {
					var r = e.checked;
					Z(e, "checked", null), e.checked = r;
				}
			}
		};
		e[ie] = n, Je(n), st();
	}
}
function wi(e, t) {
	var n = Ei(e);
	n.value !== (n.value = t ?? void 0) && (e.value !== t || t === 0 && e.nodeName === Ci) && (e.value = t ?? "");
}
function Ti(e, t) {
	var n = Ei(e);
	n.checked !== (n.checked = t ?? void 0) && (e.checked = t);
}
function Z(e, t, n, r) {
	var i = Ei(e);
	N && (i[t] = e.getAttribute(t), t === "src" || t === "srcset" || t === "href" && e.nodeName === Si) || i[t] !== (i[t] = n) && (t === "loading" && (e[M] = n), n == null ? e.removeAttribute(t) : typeof n != "string" && Oi(e).includes(t) ? e[t] = n : e.setAttribute(t, n));
}
function Ei(e) {
	return e[ee] ??= {
		[bi]: e.nodeName.includes("-"),
		[xi]: e.namespaceURI === xe
	};
}
var Di = /* @__PURE__ */ new Map();
function Oi(e) {
	var t = e.getAttribute("is") || e.nodeName, n = Di.get(t);
	if (n) return n;
	Di.set(t, n = []);
	for (var r, i = e, a = Element.prototype; a !== i;) {
		for (var s in r = o(i), r) r[s].set && s !== "innerHTML" && s !== "textContent" && s !== "innerText" && n.push(s);
		i = l(i);
	}
	return n;
}
//#endregion
//#region node_modules/svelte/src/internal/client/dom/elements/bindings/input.js
function ki(e, t, n = t) {
	var r = /* @__PURE__ */ new WeakSet();
	lt(e, "input", async (i) => {
		var a = i ? e.defaultValue : e.value;
		if (a = Ai(e) ? ji(a) : a, n(a), Ot !== null && r.add(Ot), await mr(), a !== (a = t())) {
			var o = e.selectionStart, s = e.selectionEnd, c = e.value.length;
			if (e.value = a ?? "", s !== null) {
				var l = e.value.length;
				o === s && s === c && l > c ? (e.selectionStart = l, e.selectionEnd = l) : (e.selectionStart = o, e.selectionEnd = Math.min(s, l));
			}
		}
	}), (N && e.defaultValue !== e.value || _r(t) == null && e.value) && (n(Ai(e) ? ji(e.value) : e.value), Ot !== null && r.add(Ot)), On(() => {
		var n = t();
		if (e === document.activeElement) {
			var i = Ot;
			if (r.has(i)) return;
		}
		Ai(e) && n === ji(e.value) || (e.type !== "date" || n || e.value) && n !== e.value && (e.value = n ?? "");
	});
}
function Ai(e) {
	var t = e.type;
	return t === "number" || t === "range";
}
function ji(e) {
	return e === "" ? null : +e;
}
//#endregion
//#region node_modules/svelte/src/internal/client/dom/elements/bindings/this.js
function Mi(e, t) {
	return e === t || e?.[A] === t;
}
function Ni(e = {}, t, n, r) {
	var i = Ve.r, a = Yn;
	return En(() => {
		var o, s;
		return On(() => {
			o = s, s = r?.() || [], _r(() => {
				Mi(n(...s), e) || (t(e, ...s), o && Mi(n(...o), e) && t(null, ...o));
			});
		}), () => {
			let r = a;
			for (; r !== i && r.parent !== null && r.parent.f & 33554432;) r = r.parent;
			let o = () => {
				s && Mi(n(...s), e) && t(null, ...s);
			}, c = r.teardown;
			r.teardown = () => {
				o(), c?.();
			};
		};
	}), e;
}
//#endregion
//#region node_modules/svelte/src/internal/client/reactivity/props.js
function Pi(e, t, n, r) {
	var i = !0, o = !!(n & 8), s = !!(n & 16), c = r, l = !0, u = void 0, d = () => s && i ? (u ??= /* @__PURE__ */ vt(r), H(u)) : (l && (l = !1, c = s ? _r(r) : r), c);
	let f;
	if (o) {
		var p = A in e || j in e;
		f = a(e, t)?.set ?? (p && t in e ? (n) => e[t] = n : void 0);
	}
	var m, h = !1;
	o ? [m, h] = it(() => e[t]) : m = e[t], m === void 0 && r !== void 0 && (m = d(), f && (i && me(t), f(m)));
	var g = i ? () => {
		var n = e[t];
		return n === void 0 ? d() : (l = !0, n);
	} : () => {
		var n = e[t];
		return n !== void 0 && (c = void 0), n === void 0 ? c : n;
	};
	if (i && !(n & 4)) return g;
	if (f) {
		var _ = e.$$legacy;
		return (function(e, t) {
			return arguments.length > 0 ? ((!i || !t || _ || h) && f(t ? g() : e), e) : g();
		});
	}
	var v = !1, y = (n & 1 ? vt : xt)(() => (v = !1, g()));
	o && H(y);
	var b = Yn;
	return (function(e, t) {
		if (arguments.length > 0) {
			let n = t ? H(y) : i && o ? tn(e) : e;
			return L(y, n), v = !0, c !== void 0 && (c = n), e;
		}
		return Wn && v || b.f & 16384 ? y.v : H(y);
	});
}
function Fi(e) {
	Ve === null && se("onMount"), Cn(() => {
		let t = _r(e);
		if (typeof t == "function") return t;
	});
}
function Ii(e) {
	Ve === null && se("onDestroy"), Fi(() => () => _r(e));
}
//#endregion
//#region node_modules/svelte/src/internal/disclose-version.js
typeof window < "u" && ((window.__svelte ??= {}).v ??= /* @__PURE__ */ new Set()).add("5");
//#endregion
//#region src/canvas/retained-scene.js
function Li(e, t, n, r) {
	let i = /* @__PURE__ */ new Set(), a = e.map((e) => {
		i.add(e.id);
		let t = n.get(e.id);
		return t ? t.value !== e && (t.value = e) : (t = r(e), n.set(e.id, t)), t;
	});
	for (let e of n.keys()) i.has(e) || n.delete(e);
	return t.length === a.length && a.every((e, n) => e === t[n]) ? t : a;
}
//#endregion
//#region src/ui/artifact-glyph.js
var Ri = Object.freeze([
	"context",
	"guidance",
	"draft",
	"patches",
	"candidate",
	"text",
	"data"
]), zi = .5625;
Object.freeze({
	context: "#f0e442",
	guidance: "#cc79a7",
	draft: "#7fd8c5",
	patches: "#ed8956",
	candidate: "#b49af2",
	text: "#e69f00",
	data: "#56b4e9"
}), Object.freeze({
	context: "filled circle",
	guidance: "diamond",
	draft: "pentagon",
	patches: "triangle",
	candidate: "ring with center dot",
	text: "capsule",
	data: "square"
});
var Bi = Math.sqrt(3) * 5.5 / 2, Vi = Object.freeze({
	context: "<circle cx=\"0\" cy=\"0\" r=\"5.5\" />",
	guidance: "<polygon points=\"0,-6.5 6.5,0 0,6.5 -6.5,0\" />",
	draft: "<polygon points=\"0,-5.5 5.5,-1.32 3.41,5.5 -3.41,5.5 -5.5,-1.32\" />",
	patches: `<polygon points="0,${-Bi} 5.5,${Bi} -5.5,${Bi}" />`,
	candidate: "<circle cx=\"0\" cy=\"0\" r=\"6.5\" fill=\"none\" /><circle cx=\"0\" cy=\"0\" r=\"2.475\" />",
	text: "<rect x=\"-7.5\" y=\"-3.465\" width=\"15\" height=\"6.93\" rx=\"3.465\" />",
	data: "<rect x=\"-5.5\" y=\"-5.5\" width=\"11\" height=\"11\" />"
});
function Hi(e) {
	let t = Ri.includes(e) ? e : "context";
	return `<g data-glyph="${t}" transform="scale(${zi})" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">${Vi[t]}</g>`;
}
//#endregion
//#region ui/ArtifactPin.svelte
var Ui = /* @__PURE__ */ Fr("<svg width=\"18\" height=\"18\" viewBox=\"-9 -9 18 18\" aria-hidden=\"true\" focusable=\"false\"></svg>");
function Wi(e, t) {
	Ue(t, !0);
	let n = Pi(t, "className", 3, "pc-pin-glyph");
	var r = Ui();
	ni(r, () => Hi(t.kind), !0), P(r), V(() => {
		pi(r, 0, si(n())), Z(r, "data-kind", t.kind), Z(r, "x", t.x), Z(r, "y", t.y);
	}), K(e, r), We();
}
//#endregion
//#region ui/NodeCard.svelte
var Gi = /* @__PURE__ */ G("<span class=\"pc-node-target svelte-1jilz27\" title=\"Preview target\" role=\"img\" aria-label=\"Targeted node\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" class=\"svelte-1jilz27\"><circle cx=\"12\" cy=\"12\" r=\"6\"></circle><path d=\"M12 2v5m0 10v5M2 12h5m10 0h5\"></path></svg></span>"), Ki = /* @__PURE__ */ G("<span class=\"pc-modifier-badge svelte-1jilz27\"> </span>"), qi = /* @__PURE__ */ G("<div><span class=\"pc-native-pin-label\"> </span> <div role=\"img\"><!></div></div>"), Ji = /* @__PURE__ */ G("<div class=\"pc-node-body\"> </div>"), Yi = /* @__PURE__ */ G("<span class=\"pc-native-alias\"> </span>"), Xi = /* @__PURE__ */ G("<div class=\"pc-recall-status-space\" aria-hidden=\"true\"></div>"), Zi = /* @__PURE__ */ Fr("<path class=\"pc-recall-marker\" d=\"M17 18h5M19.5 15.5v5\"></path>"), Qi = /* @__PURE__ */ Fr("<path class=\"pc-recall-marker\" d=\"m16 18 3 3 4-6\"></path>"), $i = /* @__PURE__ */ G("<button type=\"button\" class=\"pc-node-recall-status\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" class=\"svelte-1jilz27\"><path d=\"M7 5a8 8 0 1 1-3 6M3 4v6h6M12 7v5l3 2\"></path><!></svg></button>"), ea = /* @__PURE__ */ G("<button type=\"button\" class=\"pc-node-action pc-host-result\" aria-label=\"Preview host result\"><i class=\"fa-solid fa-eye\" aria-hidden=\"true\"></i> Host result</button>"), ta = /* @__PURE__ */ G("<div role=\"group\" tabindex=\"0\"><!> <div class=\"pc-native-heading\"><svg class=\"pc-native-icon svelte-1jilz27\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path></path></svg><span class=\"pc-node-title\"> </span><!></div> <div class=\"pc-native-pins\"></div> <!> <!> <!> <!> <!></div>");
function na(e, t) {
	Ue(t, !0);
	let n = Pi(t, "targeted", 3, !1), r;
	Cn(() => {
		let e = t.status;
		if (t.card.className, r) {
			for (let e of [...r.classList]) e.startsWith("pc-trace-") && r.classList.remove(e);
			e && /^[a-z0-9_-]+$/i.test(e) && r.classList.add("pc-trace-" + e);
		}
	});
	let i = (e) => e.stopPropagation();
	var a = ta();
	let o, s;
	var c = R(a), l = (e) => {
		K(e, Gi());
	};
	J(c, (e) => {
		n() && e(l);
	});
	var u = B(c, 2), d = R(u), f = R(d);
	P(d);
	var p = B(d), m = R(p, !0);
	P(p);
	var h = B(p), g = (e) => {
		var n = Ki(), r = R(n);
		P(n), V(() => {
			Z(n, "title", t.card.modifierSummary.text), Z(n, "aria-label", t.card.modifierSummary.text), q(r, `+${t.card.modifierSummary.count ?? ""}`);
		}), K(e, n);
	};
	J(h, (e) => {
		t.card.modifierSummary && e(g);
	}), P(u);
	var _ = B(u, 2);
	Y(_, 21, () => t.card.ports, (e) => e.id, (e, n) => {
		var r = qi();
		let i;
		var a = R(r), o = R(a, !0);
		P(a);
		var s = B(a, 2);
		Wi(R(s), { get kind() {
			return H(n).kind;
		} }), P(s), P(r), V(() => {
			pi(r, 1, `pc-native-row pc-native-row-${H(n).dir}`, "svelte-1jilz27"), i = hi(r, "", i, { "grid-row": H(n).row }), q(o, H(n).label), pi(s, 1, si(H(n).className), "svelte-1jilz27"), Z(s, "data-node", t.card.id), Z(s, "data-dir", H(n).dir), Z(s, "data-port", H(n).port), Z(s, "data-side", H(n).side), Z(s, "data-kind", H(n).kind), Z(s, "title", H(n).title), Z(s, "aria-label", H(n).title);
		}), U("mouseenter", s, () => t.actions.hoverPin({
			nodeId: t.card.id,
			dir: H(n).dir,
			port: H(n).port
		})), U("mouseleave", s, () => t.actions.hoverPin(null)), K(e, r);
	}), P(_);
	var v = B(_, 2), y = (e) => {
		var n = Ji(), r = R(n, !0);
		P(n), V(() => q(r, t.card.body)), K(e, n);
	};
	J(v, (e) => {
		t.card.type === "note" && e(y);
	});
	var b = B(v, 2), x = (e) => {
		var n = Yi(), r = R(n, !0);
		P(n), V(() => {
			Z(n, "title", t.card.titleHint), q(r, t.card.title);
		}), K(e, n);
	};
	J(b, (e) => {
		t.card.compact && e(x);
	});
	var S = B(b, 2), C = (e) => {
		K(e, Xi());
	};
	J(S, (e) => {
		(t.card.label === "Recall" || t.card.label === "Recall Shortcut") && e(C);
	});
	var w = B(S, 2), T = (e) => {
		var n = $i(), r = R(n), a = B(R(r)), o = (e) => {
			K(e, Zi());
		}, s = (e) => {
			K(e, Qi());
		};
		J(a, (e) => {
			t.recall.state === "generation" ? e(o) : t.recall.state === "acceptance" && e(s, 1);
		}), P(r), P(n), V(() => {
			Z(n, "data-recall-state", t.recall.state), Z(n, "title", t.recall.tooltip), Z(n, "aria-label", t.recall.ariaLabel);
		}), W("pointerdown", n, i), W("mousedown", n, i), W("contextmenu", n, i), W("keydown", n, i), W("click", n, (e) => {
			i(e), t.actions.openRecallDetails?.(t.card.id);
		}), K(e, n);
	};
	J(w, (e) => {
		t.recall && e(T);
	});
	var E = B(w, 2), D = (e) => {
		var n = ea();
		W("mousedown", n, i), W("click", n, (e) => {
			i(e), t.actions.hostResult(t.card.id);
		}), K(e, n);
	};
	J(E, (e) => {
		t.card.hostResult && e(D);
	}), P(a), Ni(a, (e) => r = e, () => r), V(() => {
		o = pi(a, 1, si(t.card.className), "svelte-1jilz27", o, { "pc-recall-capable": t.card.label === "Recall" || t.card.label === "Recall Shortcut" }), Z(a, "data-id", t.card.id), Z(a, "data-preview-target", n() ? "true" : void 0), Z(a, "title", t.card.offHint), Z(a, "aria-label", `${t.card.label}: ${t.card.title}`), s = hi(a, "", s, {
			left: `${t.card.x}px`,
			top: `${t.card.y}px`
		}), Z(f, "d", t.card.iconPath), Z(p, "title", t.card.titleHint), q(m, t.card.title);
	}), K(e, a), We();
}
Er([
	"pointerdown",
	"mousedown",
	"contextmenu",
	"keydown",
	"click"
]);
//#endregion
//#region ui/GroupCard.svelte
var ra = /* @__PURE__ */ G("<div class=\"pc-node-body\"> </div>"), ia = /* @__PURE__ */ G("<div role=\"group\"><div><i class=\"fa-solid fa-object-group\" aria-hidden=\"true\"></i> <span> </span> <span class=\"pc-group-frame-count\"> </span> <button type=\"button\"></button></div> <!></div>");
function aa(e, t) {
	Ue(t, !0);
	function n(e, n) {
		e.stopPropagation(), e.preventDefault(), t.actions.group(t.group.id, n);
	}
	function r(e, n) {
		e.stopPropagation(), e.detail === 0 && t.actions.group(t.group.id, n);
	}
	var i = ia();
	let a;
	var o = R(i), s = B(R(o), 2), c = R(s, !0);
	P(s);
	var l = B(s, 2), u = R(l, !0);
	P(l);
	var d = B(l, 2);
	P(o);
	var f = B(o, 2), p = (e) => {
		var n = ra(), r = R(n, !0);
		P(n), V(() => q(r, t.group.body)), K(e, n);
	};
	J(f, (e) => {
		t.group.collapsed && e(p);
	}), P(i), V(() => {
		pi(i, 1, si(t.group.className)), Z(i, "data-group", t.group.id), Z(i, "aria-label", `Group: ${t.group.title}`), a = hi(i, "", a, {
			left: `${t.group.x}px`,
			top: `${t.group.y}px`,
			width: `${t.group.w}px`,
			height: t.group.collapsed ? void 0 : `${t.group.h}px`
		}), pi(o, 1, si(t.group.collapsed ? "pc-node-head" : "pc-group-frame-head")), pi(s, 1, si(t.group.collapsed ? "pc-node-title" : "pc-group-frame-title")), q(c, t.group.title), q(u, t.group.count), pi(d, 1, `pc-node-action fa-solid pc-group-btn ${t.group.collapsed ? "fa-up-right-and-down-left-from-center" : "fa-down-left-and-up-right-to-center"}`), Z(d, "data-action", t.group.collapsed ? "open" : "collapse"), Z(d, "title", t.group.collapsed ? "Open group" : "Fold group"), Z(d, "aria-label", t.group.collapsed ? "Open group" : "Fold group");
	}), W("mousedown", d, (e) => n(e, t.group.collapsed ? "open" : "collapse")), W("click", d, (e) => r(e, t.group.collapsed ? "open" : "collapse")), K(e, i), We();
}
Er(["mousedown", "click"]);
//#endregion
//#region ui/WireLayer.svelte
var oa = /* @__PURE__ */ Fr("<path class=\"pc-wire-hit\"></path><path><title> </title></path><text text-anchor=\"middle\"> </text>", 1), sa = /* @__PURE__ */ Fr("<path></path>"), ca = /* @__PURE__ */ Fr("<!><!>", 1);
function la(e, t) {
	Ue(t, !0);
	var n = ca(), r = z(n);
	Y(r, 17, () => t.wires, (e) => e.id, (e, t) => {
		var n = oa(), r = z(n), i = B(r), a = R(i), o = R(a);
		P(a), P(i);
		var s = B(i), c = R(s, !0);
		P(s), V(() => {
			Z(r, "d", H(t).d), Z(r, "data-id", H(t).id), Z(i, "d", H(t).d), pi(i, 0, si(H(t).className)), Z(i, "data-id", H(t).id), Z(i, "data-kind", H(t).kind), q(o, `${H(t).kind ?? ""} artifact`), Z(s, "x", H(t).label.x), Z(s, "y", H(t).label.y), pi(s, 0, si(H(t).label.className)), Z(s, "data-id", H(t).id), q(c, H(t).label.text);
		}), K(e, n);
	});
	var i = B(r), a = (e) => {
		var n = sa();
		V(() => {
			Z(n, "d", t.ghost.d), pi(n, 0, si(t.ghost.className)), Z(n, "data-kind", t.ghost.kind);
		}), K(e, n);
	};
	J(i, (e) => {
		t.ghost && e(a);
	}), K(e, n), We();
}
//#endregion
//#region ui/CommentFrame.svelte
var ua = /* @__PURE__ */ G("<span class=\"pc-comment-title svelte-118xm2r\"> </span>"), da = /* @__PURE__ */ G("<input class=\"pc-comment-title-input svelte-118xm2r\" aria-label=\"Comment title\"/>"), fa = /* @__PURE__ */ G("<button type=\"button\" class=\"pc-comment-resize svelte-118xm2r\" title=\"Drag to resize comment\"></button>"), pa = /* @__PURE__ */ G("<div role=\"group\"><header class=\"pc-comment-header svelte-118xm2r\"><button type=\"button\" class=\"pc-comment-select svelte-118xm2r\" title=\"Drag header to move comment\">⋮⋮</button> <!></header> <div class=\"pc-comment-notes svelte-118xm2r\"> </div> <!></div>");
function ma(e, t) {
	Ue(t, !0);
	let n = (e) => e.stopPropagation();
	var r = pa();
	let i, a;
	var o = R(r), s = R(o), c = B(s, 2), l = (e) => {
		var n = ua(), r = R(n, !0);
		P(n), V(() => q(r, t.comment.title)), K(e, n);
	}, u = (e) => {
		var r = da();
		X(r), V(() => wi(r, t.comment.title)), U("focus", r, () => t.actions.select(t.comment.id)), U("pointerdown", r, n, !0), U("mousedown", r, n, !0), U("click", r, n, !0), U("keydown", r, n, !0), W("change", r, (e) => {
			t.comment.readOnly || t.actions.update(t.comment.id, { title: e.currentTarget.value });
		}), K(e, r);
	};
	J(c, (e) => {
		t.comment.readOnly ? e(l) : e(u, -1);
	}), P(o);
	var d = B(o, 2), f = R(d, !0);
	P(d);
	var p = B(d, 2), m = (e) => {
		var n = fa();
		V(() => Z(n, "aria-label", `Resize comment: ${t.comment.title}`)), W("click", n, (e) => {
			e.detail === 0 && t.actions.select(t.comment.id);
		}), K(e, n);
	};
	J(p, (e) => {
		t.comment.readOnly || e(m);
	}), P(r), V(() => {
		i = pi(r, 1, "pc-comment-frame svelte-118xm2r", null, i, {
			"pc-comment-selected": t.comment.selected,
			"pc-comment-readonly": t.comment.readOnly
		}), Z(r, "data-id", t.comment.id), Z(r, "aria-label", `Comment: ${t.comment.title}`), a = hi(r, "", a, {
			left: `${t.comment.x}px`,
			top: `${t.comment.y}px`,
			width: `${t.comment.w}px`,
			height: `${t.comment.h}px`,
			"--frame-color": t.comment.color
		}), Z(s, "aria-label", `Select comment: ${t.comment.title}`), q(f, t.comment.content);
	}), W("click", s, (e) => {
		e.detail === 0 && t.actions.select(t.comment.id);
	}), K(e, r), We();
}
Er(["click", "change"]);
//#endregion
//#region src/ui/diagnostic-states.js?v=0.27.0
var ha = (e, t, n) => ({
	id: e,
	severity: "info",
	title: t,
	message: n
}), ga = (e, t, n) => ({
	id: e,
	severity: "warning",
	title: t,
	message: n
}), _a = (e, t, n) => ({
	id: e,
	severity: "error",
	title: t,
	message: n
}), va = "This step starts when you send a message. Enable Lattice, then send a message in SillyTavern to run this workflow.", ya = ha("recording-size-limit", "Preview was not retained", "The preview recording reached its size limit, so this output was not retained. This does not mean the model stopped early."), ba = ha("recording-invalid", "Recorded preview is unavailable", "The recorded preview could not be read safely. This does not establish whether the step succeeded. Choose a current output to inspect."), xa = {
	PREVIEW_NOT_RUN: ha("not-run", "Not run yet", "This step has not run yet. Use Run to here when it is available."),
	PREVIEW_RUNNING: ha("running", "Running", "This step is running. Its output will appear when it finishes."),
	PREVIEW_WORKFLOW_RUNNING: ha("workflow-running", "Workflow is running", "The workflow is running. This output is not available yet."),
	PREVIEW_WAITING: ha("waiting", "Waiting for input", "This step is waiting for an earlier step to finish."),
	PREVIEW_UNRESOLVED: ha("unresolved", "No input for this branch", "An earlier step did not produce the input this branch needs. Check that step’s output and branch conditions."),
	PREVIEW_SKIPPED: ha("skipped", "Step skipped", "This branch was intentionally skipped for this run."),
	OUTPUT_NOT_RETAINED: ha("not-retained", "Output is not retained", "No saved preview is available for this output."),
	OUTPUT_REMOVED: ha("output-removed", "Output is no longer available", "The selected output was removed or changed. Choose a current output."),
	EARLIER_OUTPUT: ha("earlier-output", "Earlier output", "This is output from an earlier run. It does not describe the current run."),
	PREVIEW_TRUNCATED: ha("preview-truncated", "Preview shortened", "Only the displayed preview was shortened. This does not mean the model stopped early."),
	MANUAL_NATIVE_TRIGGER_REQUIRED: ha("send-required", "Starts with a message", va),
	NATIVE_SEND_REQUIRED: ha("send-required", "Starts with a message", va),
	RECALL_PREVIEW_NO_ACTIVATION: ha("recall-preview", "Recall waits for generation", "Recall runs during a normal SillyTavern message or generated swipe. A manual preview does not activate it."),
	ABORTED: ha("stopped", "Stopped", "This action was stopped. Late output will not be used."),
	CANCELLED: ha("cancelled", "Cancelled", "This action was cancelled."),
	WORKFLOW_CANCELLED: ha("workflow-cancelled", "Workflow stopped", "The workflow was stopped."),
	FILE_CANCELLED: ha("file-cancelled", "File action cancelled", "The file action was cancelled. The open draft is still available."),
	NODE_CONFIGURATION_CANCELLED: ha("node-cancelled", "Node creation cancelled", "Node creation was cancelled."),
	BUSY: ha("busy", "Another action is running", "Wait for generation or reply application to finish before continuing."),
	ALREADY_APPLIED: ha("already-applied", "Already applied", "This revision has already been applied."),
	COMMIT_DISABLED: ha("commit-preview", "Preview does not save memory", "Preview and dry-run execution do not commit memory."),
	RECALL_REGISTRATION_PENDING: ha("recall-registering", "Shortcut is being prepared", "The Recall Shortcut is still being registered."),
	CONTEXT_PRESERVATION: ha("context-preserved", "Original context retained", "The original context is retained alongside the compacted output."),
	COMPRESSION_INPUT_OMITTED: ga("compression-omitted", "Some context was left out", "Some older messages did not fit the compression input. The originals are retained."),
	PERSISTENCE_PARTIAL: ga("save-partial", "Some changes are not saved", "The accepted reply is retained. Some associated changes could not be saved. Review each target’s save status."),
	RECENT_STORAGE_FAILED: ga("recent-storage", "Recent files could not be remembered", "The browser could not remember recent workflow files. Your open workflow is still available."),
	VIEW_PERSISTENCE: ga("view-persistence", "View layout was reset", "The saved graph layout could not be restored. The workflow is available with a fresh view layout.")
};
for (let e of [
	"PERSISTENCE_UNKNOWN",
	"PERSISTENCE_UNVERIFIED",
	"SAVE_UNVERIFIED",
	"APPLY_SAVE_UNVERIFIED"
]) xa[e] = ga("save-unverified", "Saving is not confirmed", "The save outcome could not be verified. Confirm the stored data before making another write.");
var Sa = /* @__PURE__ */ new Map([
	["Enter valid JSON before saving.", {
		id: "json-setting",
		severity: "error",
		title: "Check the JSON",
		message: "Enter valid JSON before saving."
	}],
	["Enter a finite number before saving.", {
		id: "number-setting",
		severity: "error",
		title: "Check the number",
		message: "Enter a finite number before saving."
	}],
	["Enter a number within the allowed range and step.", {
		id: "range-setting",
		severity: "error",
		title: "Check the number",
		message: "Enter a number within the allowed range and step."
	}],
	["Enter a model identifier before saving an override.", {
		id: "model-override-empty",
		severity: "error",
		title: "Enter a model identifier",
		message: "Enter a model identifier before saving an override."
	}],
	["Enter a model identifier of 1–256 characters.", {
		id: "model-override-length",
		severity: "error",
		title: "Check the model identifier",
		message: "Enter a model identifier of 1–256 characters."
	}],
	["Choose a connection to run.", {
		id: "connection-required",
		severity: "error",
		title: "Choose a connection",
		message: "Choose a connection to run."
	}],
	["Assign a fixed connection to this node or its model role.", {
		id: "fixed-connection",
		severity: "error",
		title: "Choose a connection",
		message: "Assign a fixed connection to this node or its model role."
	}],
	["Use a JSON object before selecting a configured value.", {
		id: "configuration-json",
		severity: "error",
		title: "Check the controls JSON",
		message: "Use a JSON object before selecting a configured value."
	}],
	["Use a positive starting day, a time within the day, and a day length in whole minutes.", _a("clock-starting-values", "Check the clock’s starting values", "Set Starting day to a positive whole number, Starting time to a time within the day, and Hours per day to a positive duration in whole minutes. Enter a Calendar name.")],
	["Load a valid clock template before changing its starting values.", _a("clock-template-needed", "Load a valid clock template", "Use Load initial values to load a valid clock template before changing its starting values.")],
	["Load the initial template before saving.", _a("initial-template-needed", "Load initial values first", "Use Load initial values before changing the initial template with Save settings.")],
	["Choose an actor for private data.", _a("private-actor-needed", "Choose the private actor", "Enter Actor ID when Visibility is Actor private.")],
	["The initial template could not be loaded.", _a("initial-template-load", "Initial template could not be loaded", "The initial template could not be loaded. Check the source document and its authorization in Workflow Data.")],
	["Check the initial settings.", _a("initial-settings", "Check the initial settings", "Check the initial template and settings in Workflow Data.")],
	["Check the new data settings.", _a("new-data-settings", "Check the new data settings", "Check Name, Format, Visibility, and the required initial values in Workflow Data.")],
	["Workflow data could not be updated.", ga("workflow-data-update-unverified", "Workflow Data update is not confirmed", "The Workflow Data update could not be confirmed. Inspect the current data and initial settings before making another change.")],
	["Workflow Data setup could not be applied.", ga("workflow-data-setup-unverified", "Workflow Data setup is not confirmed", "The Workflow Data setup change could not be confirmed. Inspect the current configuration before making another change.")],
	["The subgraph could not be saved. Check the current settings before trying the edit again.", ga("subgraph-save-unverified", "Subgraph saving is not confirmed", "The subgraph save could not be confirmed. Inspect the saved subgraph and current settings before making another change.")],
	["The edit could not be accepted. Check the current settings before trying the edit again.", _a("edit-not-accepted", "Edit could not be accepted", "The edit could not be accepted. Check the current settings and selection before preparing another edit.")],
	["The node could not be prepared.", _a("node-not-prepared", "Node could not be prepared", "The node could not be prepared. Check the required controls in node configuration.")],
	["Memory recall could not be updated.", _a("recall-not-updated", "Recall could not be updated", "Recall could not be updated. Reopen the Recall controls and inspect the current scope and queue status.")],
	["Memory recall is unavailable.", ha("recall-unavailable", "Recall is unavailable", "Recall is unavailable. Check the active chat, character, and enabled workflow.")],
	["The portal change could not be accepted.", _a("portal-not-accepted", "Portal change could not be accepted", "The portal change could not be accepted. Check the current graph view and portal settings.")],
	["Could not change connection profile", _a("profile-not-changed", "Connection profile could not be changed", "The Connection profile could not be changed. Select a current node and check the available profiles.")],
	["Lattice disabled", ha("lattice-disabled", "Lattice is disabled", "Enable Lattice to use this feature.")],
	["This Recall uses automatic triggers.", ha("recall-automatic", "Recall uses automatic triggers", "This Recall uses automatic triggers. Queue recall is available for manual activation settings.")],
	["Recall is already queued.", ha("recall-queued", "Recall is already queued", "Recall is already queued. Use Cancel recall to remove the queued request.")],
	["Memory recall is available in the root workflow.", ha("recall-root", "Open the root workflow", "Memory recall is available in the root workflow.")],
	["Memory recall requires an active user, chat, and character.", ha("recall-active-scope", "Recall needs an active chat", "Open an active user, chat, and character to use Recall.")],
	["This node belongs to another character.", ha("recall-character", "Select the matching character", "This node belongs to another character. Select the matching character to use its Recall controls.")],
	["Add a matching Recall Shortcut to queue this memory set.", ha("recall-shortcut-needed", "Add a Recall Shortcut", "Add a matching Recall Shortcut to queue this memory set.")],
	["The Recall and Shortcut generation targets do not overlap.", ha("recall-targets", "Recall targets do not match", "Choose overlapping generation targets for the Recall and matching Shortcut in Details.")],
	["No manual recall is queued for these nodes.", ha("recall-cancel-empty", "No Recall request to cancel", "No manual recall is queued for these nodes.")],
	["Select an eligible Recall or Recall Shortcut node.", ha("recall-selection", "Select a Recall node", "Select an eligible Recall or Recall Shortcut node.")],
	["Library definitions are read-only.", ha("read-only-library", "Library definition", "Library definitions are read-only. Make a local copy to edit this definition.")],
	["Library inspection is read-only and has no runtime output.", ha("library-preview", "Library definition preview", "Library definitions do not run here. Open a workflow that uses this definition to inspect its output.")],
	["The previous workspace presentation is unreadable.", ga("recovered-layout", "Saved view could not be restored", "The workflow can be opened, but its saved view layout could not be restored.")],
	["The previous recovery draft workspace presentation is unreadable.", ga("recovered-layout", "Saved view could not be restored", "The recovery draft can be opened, but its saved view layout could not be restored.")],
	["No output recorded yet.", xa.PREVIEW_NOT_RUN],
	["Artifact omitted: recording-byte-limit", ya],
	["Artifact omitted: recording-metadata-limit", ya],
	["Artifact omitted: canonical-prefix-limit", ya],
	["Artifact omitted: invalid-diagnostic-data", ba],
	["Artifact omitted: invalid diagnostic data", ba],
	["Artifact omitted: unavailable", ha("recording-unavailable", "Recorded preview is unavailable", "No recorded preview is available for this output. Choose a current output to inspect.")],
	["Artifact omitted: historical wrapper mapping unavailable", ha("historical-mapping", "Earlier output cannot be located", "This earlier output cannot be matched to the current subgraph. Choose a current output to inspect.")],
	["Workflow Data setup is unavailable.", ha("data-setup", "Workflow Data needs setup", "Open an active chat to configure Workflow Data.")]
]), Ca = (e, t, n) => ({
	id: e,
	severity: "error",
	title: t,
	message: n
}), wa = (e, t, n) => ({
	id: e,
	severity: "warning",
	title: t,
	message: n
}), Ta = " Running it again makes another model request.", Ea = [
	[
		"UNSUPPORTED_BINDING",
		/discards completion evidence|preserves? (?:its )?completion reason/i,
		Ca("binding-finish", "Connection cannot verify completion", "This connection does not preserve the completion reason Lattice needs. Choose a connection that reports its completion reason.")
	],
	[
		"UNSUPPORTED_BINDING",
		/proxy|directly resolved/i,
		Ca("binding-proxy", "Proxy connection cannot be verified", "Lattice cannot verify this proxy route. Choose a direct connection in Connection profile.")
	],
	[
		"UNSUPPORTED_BINDING",
		/samplers across providers|switching the live connection/i,
		Ca("binding-provider", "Provider settings do not match", "This text completion profile uses a different provider from the active SillyTavern connection. Choose a profile for the active provider.")
	],
	[
		"TRUNCATED_OUTPUT",
		/summary/i,
		wa("summary-truncated", "Summary stopped early", "The summary reached Output tokens before finishing. The original context is retained. Increase Output tokens in Details if you choose to run compression again." + Ta)
	],
	[
		"COMPLETION_UNVERIFIED",
		/summary/i,
		wa("summary-unverified", "Summary completion is not confirmed", "The connection did not confirm that the summary finished. The original context is retained. Check that the connection reports a completion reason.")
	],
	[
		"EMPTY_OUTPUT",
		/summary/i,
		wa("summary-empty", "Summary is empty", "The model returned no summary text. The original context is retained. Check the connection and compression settings." + Ta)
	],
	[
		"REQUEST_FAILED",
		/compression/i,
		Ca("compression-request", "Compression could not finish", "The compression request could not finish. The original context is retained. Check Connection profile and the provider status." + Ta)
	],
	[
		"INVALID_SETTINGS",
		/target\/completion limit|compaction method/i,
		Ca("compactor-settings", "Check Smart Compactor settings", "Use positive Target tokens and Output tokens, a valid Keep recent count, and a supported Method in Details.")
	],
	[
		"INVALID_SETTINGS",
		/presentation|layout|enabled\/group/i,
		Ca("node-layout", "Check node appearance", "The saved node appearance or layout is invalid. Check the node’s Details and group membership.")
	],
	[
		"INVALID_SETTINGS",
		/model binding|role binding/i,
		Ca("binding-setting", "Check model settings", "Check Connection profile, Model mode, and Model identifier in Details.")
	],
	[
		"INVALID_SETTINGS",
		/^Invalid maxTokens\.$/i,
		Ca("output-tokens-setting", "Check Output tokens", "Enter a positive whole number within the allowed range for Output tokens in Details.")
	]
], Da = {
	UNSUPPORTED_BINDING: Ca("binding-unsupported", "Connection type is not supported", "Choose a supported chat or text completion connection in Connection profile."),
	BINDING_MISSING: Ca("binding-missing", "Choose a connection", "Choose Connection profile on this node before running it."),
	PROFILE_MISSING: Ca("profile-missing", "Connection profile is unavailable", "The selected Connection profile is missing or unavailable. Choose an available profile on the node."),
	MODEL_MISSING: Ca("model-missing", "Choose a model", "Select a model in the connection profile or set Model identifier in Details."),
	PRESET_MISSING: Ca("preset-missing", "Sampler preset is unavailable", "The selected connection profile’s sampler preset is missing. Select an available preset in SillyTavern Connection Manager."),
	INSTRUCT_MISSING: Ca("instruct-missing", "Instruct preset is unavailable", "The selected connection profile’s instruct preset is missing. Choose an available instruct preset in SillyTavern."),
	ENDPOINT_MISSING: Ca("endpoint-missing", "Connection needs provider settings", "Complete the endpoint and account settings for the selected provider in SillyTavern."),
	BINDING_CHANGED: Ca("binding-changed", "Connection settings changed", "The connection changed after it was checked. Review Connection profile and the current provider settings before running this step."),
	SERVICE_UNAVAILABLE: Ca("service-unavailable", "SillyTavern service is unavailable", "A required SillyTavern service is unavailable. Check the installed host version and connection settings."),
	REQUEST_FAILED: Ca("request-failed", "Model request could not finish", "The model request could not finish. Check Connection profile and the provider status." + Ta),
	TRUNCATED_OUTPUT: wa("model-truncated", "Model output stopped early", "The model reached Output tokens before finishing. Increase Output tokens in Details if you choose to run this step again." + Ta),
	COMPLETION_UNVERIFIED: wa("completion-unverified", "Completion is not confirmed", "The connection did not confirm that the model finished. The unverified result is not used. Check that the connection reports a completion reason."),
	EMPTY_OUTPUT: Ca("output-empty", "No text returned", "The model returned no text. Check Connection profile and the request settings." + Ta),
	PIN_MISSING: Ca("pin-missing", "Pinned wording was not found", "A phrase in Pinned wording is missing from the input. Check its exact spelling and capitalization in Details."),
	PIN_BUDGET_EXCEEDED: Ca("pin-budget", "Protected context exceeds the budget", "Pinned wording and Keep recent preserve more context than Target tokens allows. Increase Target tokens or reduce the protected material in Details."),
	INPUT_LIMIT: Ca("compression-input-limit", "Context does not fit compression", "No flexible message fits the compression input limit. Reduce the input context or use Method “select”. The original context is retained."),
	COMPACTION_OVERFLOW: wa("compaction-overflow", "Summary exceeds the context budget", "The summary and protected messages exceed Target tokens. The original context is retained. Increase Target tokens or reduce Pinned wording and Keep recent."),
	TOKEN_COUNT_FAILED: Ca("token-count-failed", "Token count is unavailable", "Lattice could not measure the token count. Check the selected connection’s tokenizer. The original input is retained.")
}, Oa = (e, t, n) => ({
	id: e,
	severity: "error",
	title: t,
	message: n
}), ka = (e, t, n) => ({
	id: e,
	severity: "info",
	title: t,
	message: n
}), Aa = (e, t, n) => ({
	id: e,
	severity: "warning",
	title: t,
	message: n
}), ja = Oa("document-authorization", "Choose an authorized document", "Authorize the document in Workflow › Configure › Workflow Data, then select it in the node’s Details."), Ma = Oa("private-material", "Private material is protected", "This output contains restricted or private material and cannot be published here. Check the source visibility and the intended actor."), Na = Oa("actor-mismatch", "Character scope does not match", "This data belongs to a different character or chat. Select the intended character and check the node’s actor settings."), Pa = Oa("resource-scope-changed", "The active scope changed", "The active user, chat, character, or workflow changed. Reopen the affected controls for the current scope."), Fa = {
	FILE_TOO_LARGE: Oa("file-size", "File is too large", "Choose a file no larger than 400,000 bytes."),
	FILE_CONTENT_TOO_LARGE: Oa("file-text-size", "File text is too long", "Choose a file containing no more than 100,000 characters."),
	FILE_NAME_INVALID: Oa("file-name", "Filename is invalid", "Choose a file with a filename between 1 and 255 characters."),
	FILE_INVALID_UTF8: Oa("file-encoding", "File text cannot be read", "Choose a UTF-8 text file."),
	FILE_PERMISSION: Oa("file-permission", "File access was denied", "Choose the workflow file again and allow access, or use Save As to choose another destination."),
	FILE_NOT_FOUND: Oa("file-missing", "File is missing", "The selected file or document no longer exists. Choose an existing file or check the target in Workflow Data."),
	FILE_READ_FAILED: Oa("file-read", "File could not be read", "The selected file could not be read. Choose an accessible file and check its permissions."),
	FILE_WRITE_FAILED: Oa("file-save", "Workflow file could not be saved", "The workflow file could not be saved. Your draft remains open. Use Save As to choose an accessible destination."),
	FILE_DOWNLOAD_FAILED: Oa("file-download", "Workflow copy could not be saved", "The workflow JSON copy could not be saved. Your draft remains open. Check browser download permissions."),
	FILE_CONFLICT: Oa("workflow-file-conflict", "Workflow file changed", "The workflow file changed outside Lattice. Use Save As to preserve your draft without overwriting those changes."),
	FILE_REVISION_CONFLICT: Oa("document-revision-conflict", "Document changed", "The target document changed after it was read. Prepare a new projection and its dependent story output from the current document before acceptance."),
	FILE_REFERENCE_UNAUTHORIZED: Oa("file-reference", "Read the document first", "Connect the Reference output from the current authorized Read File node. An older or substituted reference cannot authorize a write."),
	FILE_RECEIPT_LIMIT: Oa("document-receipts", "Document history is full", "The document reached its revision or save history limit. Reconcile its stored history before preparing another write."),
	FILE_DOCUMENT_LIMIT: Oa("document-limit", "Document exceeds the storage limit", "The proposed document and save history are too large to store. Reduce the document size before preparing another write."),
	FILE_FORMAT_LOCKED: Oa("document-format", "Document format is fixed", "An existing document keeps its format. Create a different target in Workflow Data to use another format."),
	FILE_ACCEPTANCE_REQUIRED: ka("file-acceptance", "Saving waits for acceptance", "File changes are proposed during execution and are saved only when the full workflow result is accepted."),
	FILE_STAGE_FAILED: Oa("file-staging", "File change could not be prepared", "The file change could not be prepared. Check the target document, current reference, and source evidence."),
	FILE_INTENT_CONFLICT: Oa("file-intent-conflict", "File change identity conflicts", "A previously prepared file change uses this identity for different content. Inspect the retained change and prepare a distinct current change."),
	FILE_BACKEND_FAILED: Oa("document-storage", "Document storage is unavailable", "The document storage service could not complete this action. Check the active chat and Workflow Data configuration."),
	FILE_EVIDENCE_FAILED: Oa("file-evidence", "File evidence could not be checked", "The source evidence for this file change could not be checked. Inspect the current source and prepare evidence from it."),
	DOCUMENT_SETUP_UNAVAILABLE: ka("document-setup", "Workflow Data needs setup", "Open an active user and chat, then configure documents in Workflow › Configure › Workflow Data."),
	CHAT_REQUIRED: ka("chat-required", "Open a chat", "Open an active chat before using this feature."),
	ACTOR_REQUIRED: ka("actor-required", "Select a character", "Select an active character before using character memory."),
	PRIVATE_MATERIAL: Ma,
	PRIVATE_DESTINATION: Oa("private-destination", "Destination cannot receive private data", "Choose a destination whose visibility preserves the data’s private actor scope. Check visibility in Workflow Data."),
	INVALIDATED_SOURCES: Aa("historical-source-changed", "Stored evidence changed", "Some stored evidence changed or was removed. Review and reconcile that evidence before using it for another memory change."),
	FINAL_EVIDENCE_REEXTRACT_REQUIRED: Oa("final-evidence", "Evidence does not match the final reply", "The final reply changed after its evidence was captured. Extract or rebase the evidence from the final narrative before accepting it."),
	STALE_VERSION: Oa("memory-version", "Memory changed", "The memory store changed after this proposal was prepared. Read the current memory and prepare a new proposal before acceptance."),
	IDEMPOTENCY_CONFLICT: Oa("memory-identity-conflict", "Memory change identity conflicts", "This memory change identity already refers to different or unconfirmed content. Inspect the stored change before preparing another write."),
	MEMORY_SAVE_UNAVAILABLE: Oa("memory-save-unavailable", "Memory saving is unavailable", "SillyTavern’s metadata save service is unavailable. Check the active chat and host installation."),
	MEMORY_BACKEND_FAILED: Oa("memory-backend", "Memory storage could not complete this action", "The memory storage service could not complete this action. Check the active chat, character, and memory configuration."),
	RECEIPT_LIMIT: Oa("memory-receipts", "Memory history is full", "The memory save history reached its limit. Reconcile stored receipts before preparing another write."),
	VERSION_LIMIT: Oa("memory-version-limit", "Memory version limit reached", "The memory store reached its version limit. Reconcile the store before preparing another write."),
	RECALL_UNAVAILABLE: ka("recall-setup", "Recall needs setup", "Enable Lattice and open a unified workflow for the active character to use Recall."),
	RECALL_QUEUE_CONFLICT: Oa("recall-policy", "Recall settings do not match", "Matching Recall Shortcuts must use matching generation target, repetition, and consumption settings. Check their Details."),
	RECALL_HOTKEY_CONFLICT: Oa("recall-shortcut-conflict", "Shortcut is already assigned", "This key is assigned to another active Recall Shortcut. Choose a different key in Details."),
	INVALID_RECALL_HOTKEY: Oa("recall-shortcut-key", "Choose a supported shortcut", "Choose a physical key with Control, Alt, or Meta, or a function key in Recall Shortcut Details."),
	RECALL_HOTKEY_UNAVAILABLE: Oa("recall-key-unavailable", "Recall shortcut is unavailable", "The Recall keyboard listener is unavailable. Check the active workflow and host installation."),
	RECALL_NOT_QUEUED: ka("recall-not-queued", "Recall is not queued", "Use Queue recall on a matching Recall Shortcut to arm manual Recall. Automatic triggers use their own conditions."),
	RECALL_TARGET_INELIGIBLE: ka("recall-ineligible", "Recall does not target this generation", "This generation does not match the configured Recall target. Check the generation target in Details."),
	RECALL_ALREADY_ACTIVATED: ka("recall-activated", "Recall already activated", "This memory set already activated for this generation."),
	RECALL_USE_RESERVED: ka("recall-reserved", "Recall is reserved", "A matching Recall allowance is reserved by another generation. Wait for that generation to finish."),
	RECALL_QUEUE_LIMIT: Oa("recall-queue-limit", "Recall queue is full", "Cancel unused Recall requests before adding more."),
	RECALL_GRAPH_INVALID: Oa("recall-workflow", "Recall workflow needs attention", "Recall requires a valid active unified workflow. Review Workflow validation before queueing Recall."),
	RECALL_NODE_UNAVAILABLE: Oa("recall-node", "Choose a current Recall Shortcut", "Select a configured Recall Shortcut in the current workflow."),
	RECALL_RECORDS_UNVERIFIED: Oa("recall-records", "Recall records are not verified", "Use records from a current authorized File or Memory read. Changed or invented records cannot be used for Recall."),
	RECALL_PRESENCE_UNVERIFIED: Oa("recall-presence", "Character presence is not verified", "Recall needs the intended character’s current scene presence and supporting source evidence.")
};
for (let e of [
	"DOCUMENT_NOT_AUTHORIZED",
	"FILE_NOT_AUTHORIZED",
	"FILE_TARGET_UNAUTHORIZED",
	"DOCUMENT_LEASE_UNAUTHORIZED"
]) Fa[e] = ja;
for (let e of [
	"SCOPE_MISMATCH",
	"RECALL_ACTOR_MISMATCH",
	"ACTOR_FILE_SCOPE_MISMATCH",
	"ACTOR_GUIDANCE_SCOPE"
]) Fa[e] = Na;
for (let e of [
	"STALE_DOCUMENT_SETUP",
	"STALE_DOCUMENT_SCOPE",
	"STALE_FILE_SCOPE",
	"STALE_RECALL_SCOPE",
	"STALE_RECALL_CONTEXT",
	"STALE_RECALL_SHORTCUT",
	"STALE_RECALL_GENERATION",
	"STALE_EFFECT_SCOPE"
]) Fa[e] = Pa;
var Ia = [
	["INVALID_MEMORY_CONFIG INVALID_MEMORY_CONTEXT INVALID_MEMORY_METADATA INVALID_MEMORY_READ INVALID_MEMORY_RECALL INVALID_MEMORY_SNAPSHOT INVALID_MEMORY_RECEIPTS INVALID_MEMORY_CONTROLS INVALID_MEMORY_CAS", Oa("memory-settings", "Memory settings need attention", "The memory settings or stored data are invalid. Check the active character, store, and node settings in Details.")],
	["INVALID_RECALL_SCOPE INVALID_RECALL_QUEUE INVALID_RECALL_ACTIVATION INVALID_RECALL_TRIGGER INVALID_RECALL_OWNER INVALID_RECALL_AUTHORITY INVALID_RECALL_PORTS INVALID_RECALL_GENERATION INVALID_RECALL_SETTLEMENT", Oa("recall-settings", "Recall settings need attention", "Check the Recall actor, memory set, generation target, and activation settings in Details.")],
	["INVALID_FILE_CONFIG INVALID_FILE_BACKEND_CONFIG INVALID_FILE_METADATA INVALID_FILE_SNAPSHOT INVALID_FILE_INTENT INVALID_FILE_CONTROLS INVALID_FILE_BACKEND_UPDATE INVALID_FILE_RESPONSE", Oa("document-settings", "Document data needs attention", "The document data or storage configuration is invalid. Check Workflow Data and the affected node’s Details.")],
	["INVALID_DOCUMENT_SETUP INVALID_WORKFLOW_DATA INVALID_CLOCK_TEMPLATE DOCUMENT_SETUP_FAILED", Oa("document-setup-invalid", "Check Workflow Data settings", "Check the target name, initial template, format, and visibility in Workflow Data.")],
	["INVALID_INTROSPECTION_EVIDENCE INVALID_ACCEPTED_MEMORY STATE_EVIDENCE_CHANGED", Oa("memory-evidence", "Memory evidence needs attention", "Use current settled source evidence that belongs to the intended character and matches the accepted narrative.")],
	["FILE_CAPTURE_RELEASED FILE_INTENT_UNAUTHORIZED MEMORY_AUTHORITY_RELEASED RECALL_STATE_RELEASED RECALL_CLAIM_CLOSED RECALL_CLAIM_UNAUTHORIZED RECALL_OWNER_MISSING RECALL_SOURCE_UNAVAILABLE RECALL_PROVENANCE_REQUIRED STALE_RECALL_SOURCE STALE_MEMORY_EVIDENCE", Oa("resource-expired", "Recorded source is no longer current", "The recorded source or permission is no longer current. Inspect the active source and prepare this action again.")]
];
for (let [e, t] of Ia) for (let n of e.split(" ")) Fa[n] = t;
//#endregion
//#region src/ui/diagnostic-workflow.js?v=0.27.0
var La = (e, t, n) => ({
	id: e,
	severity: "error",
	title: t,
	message: n
}), Ra = (e, t, n) => ({
	id: e,
	severity: "info",
	title: t,
	message: n
}), za = La("wire-invalid", "Connection needs attention", "Reconnect existing compatible output and input pins. Remove connections to deleted nodes."), Ba = La("subgraph-invalid", "Subgraph data needs attention", "The subgraph data does not match its saved definition. Check its definition, ports, and overrides before using it."), Va = Ra("definition-read-only", "Definition is read-only", "Make a local copy before editing this subgraph definition."), Ha = {
	UPSTREAM_FAILED: La("upstream-failed", "An earlier step failed", "This step could not run because an earlier step failed. Inspect the earlier step’s diagnostic first."),
	ARTIFACT_KIND: La("wire-type", "Connection types do not match", "Connect pins with compatible types. The output type must match the input type."),
	AMBIGUOUS_INPUT: La("input-multiple", "Input has more than one source", "Each named input accepts one source. Remove the extra connection or combine the data in an appropriate node first."),
	CYCLE: La("workflow-loop", "Connections form a loop", "The connections form a dependency loop. Remove a connection that feeds a later step back into an earlier step."),
	MISSING_PORTAL: La("portal-missing", "Portal source is missing", "This portal consumer has no publisher in this graph. Select an existing portal or publish a matching output."),
	INVALID_PORTAL: La("portal-invalid", "Portal needs attention", "Check the portal’s name, source output, and type. Publish an existing output with the same type."),
	MISSING_TERMINAL: La("terminal-missing", "Workflow needs an output", "Add Review / Publish to finish a unified workflow, or a stage output to finish a helper."),
	DISABLED_OPERATION: La("dependency-disabled", "A required step is disabled", "Enable the selected step and its required dependencies before using Run to here."),
	INVALID_STAGE_DEPENDENCY: La("stage-reversed", "Preparation depends on a reply", "A preparation step cannot read response-stage output. Move a compatible node to the response stage or remove the reverse connection."),
	WRONG_PHASE: La("stage-mismatch", "Workflow stage does not match", "Choose nodes and subgraphs that support the containing workflow stage. Retired workflows are available for archived export."),
	INVALID_PHASE: La("node-stage", "Node stage does not match", "Choose a supported preparation or response stage in Details for this node."),
	ROOT_ONLY_OPERATION: La("root-only", "Step belongs in the root workflow", "Place this step in the root workflow. Reusable helpers need explicit snapshot inputs for state."),
	ROOT_BOUNDARY: La("root-boundary", "Boundary belongs inside a subgraph", "Add Input and Output boundary nodes inside an editable subgraph."),
	ROOT_ONLY: La("root-authority", "Full workflow acceptance is required", "This action requires the authorized root workflow and cannot run as an isolated helper."),
	ROOT_REQUIRED: La("root-settlement", "Full workflow acceptance is required", "Accept the full workflow result to commit its prepared changes. A manual preview does not authorize saving."),
	UNKNOWN_OPERATION: La("operation-unsupported", "Node type is not supported", "This node type or version is not supported by the installed Lattice version. Check the workflow version and node reference."),
	INVALID_SETTINGS: La("node-settings", "Node settings need attention", "Some saved settings are invalid. Check the affected node’s controls in Details."),
	INVALID_CONFIGURATION: La("node-configuration", "Node configuration needs attention", "Use valid JSON containing the declared node controls, then complete the required settings in node configuration."),
	INVALID_INPUT: La("input-invalid", "Input data does not match", "The input data does not match this step’s expected type or shape. Check the connected source and the node’s Details."),
	INVALID_CONTEXT: La("context-invalid", "Context data does not match", "The context input is invalid. Check the connected context source and its message data."),
	INVALID_TARGET: La("target-invalid", "Choose a current output", "Select an existing output pin or terminal step in the current workflow."),
	INVALID_SELECTION: La("selection-changed", "Selection needs attention", "Select current workflow nodes before continuing."),
	INVALID_GROUP: La("group-selection", "Group selection needs attention", "Select an editable group to ungroup, or at least two ordinary nodes to create a group."),
	INVALID_JSON: La("workflow-json", "JSON could not be read", "The text is not valid JSON. Check the JSON syntax or choose a valid workflow file."),
	MALFORMED_WORKFLOW: La("workflow-malformed", "Workflow data is invalid", "The workflow data is invalid or exceeds its size limit. Choose a valid Lattice workflow file."),
	UNSUPPORTED_PACKAGE: La("workflow-package", "Choose a Lattice workflow", "Choose a compatible Lattice workflow document or supported portable workflow JSON."),
	UNSUPPORTED_VERSION: La("workflow-version", "Workflow version is not supported", "This workflow uses an unsupported format or runtime version. Open a compatible workflow or check the installed Lattice version."),
	MISSING_DEFINITION: La("definition-missing", "Subgraph definition is missing", "The subgraph’s exact saved definition is not included. Import a workflow or subgraph package that includes its pinned definition."),
	DEFINITION_CONFLICT: La("definition-conflict", "Subgraph versions conflict", "Two subgraphs use the same identity and version for different content. Use an unambiguous saved definition or create a local copy."),
	DEFINITION_RECURSION: La("definition-recursion", "Subgraph includes itself", "A subgraph cannot include itself through nested definitions. Remove the recursive instance."),
	DEFINITION_DEPTH: La("definition-depth", "Subgraphs are nested too deeply", "The workflow exceeds eight nested subgraph levels. Flatten or simplify the nested definitions."),
	DEFINITION_IN_USE: La("definition-in-use", "Subgraph is still in use", "Another saved subgraph uses this revision. Remove that dependency before deleting the saved definition."),
	PARAMETER_IN_USE: La("parameter-in-use", "Parameter is still in use", "Reset the surviving override or remove the enclosing parameter exposure before removing this parameter."),
	BOUNDARY_SELECTION: La("boundary-copy", "Copy the subgraph or its interior", "Input and Output boundary nodes belong to their subgraph definition. Copy the interior nodes or the whole subgraph instance."),
	STALE_CONTEXT: La("view-changed", "The view changed", "The view or selection changed after this action was prepared. Reopen the affected controls or select the current node."),
	STALE_DOCUMENT: La("document-changed", "Workflow changed during editing", "The workflow changed after the edit began. Prepare the edit again from the current workflow."),
	UNSUPPORTED_VIEW: La("view-unavailable", "Graph view is unavailable", "This graph view is unavailable. Open an existing view in the current workflow."),
	VIEW_INACTIVE: La("view-inactive", "Graph view is unavailable", "This graph view is unavailable. Open an existing view in the current workflow."),
	STALE_DEFINITION: La("definition-changed", "Subgraph changed", "The subgraph definition changed after this action was prepared. Reopen the current subgraph and prepare the edit again."),
	STALE_CANDIDATE: La("candidate-expired", "Review is no longer current", "This candidate is no longer available or no longer matches the selected reply. Prepare a new review from the current source; running model steps again makes another model request."),
	APPLY_UNAVAILABLE: La("apply-unavailable", "Reply application is unavailable", "Required SillyTavern reply, save, or swipe services are unavailable. Check the host installation before applying this review."),
	APPLY_FAILED: La("apply-failed", "Reply could not be applied", "The revision could not be applied and the original local message was restored. A save that was attempted may still be unverified; inspect the stored chat before taking another action."),
	MULTIPLE_NATIVE_GENERATIONS: La("native-multiple", "More than one Generate Reply path", "A unified workflow supports one Generate Reply boundary. Keep one generation path in the selected workflow."),
	NATIVE_ACTIVATION_REQUIRED: La("activation-required", "Generate Reply needs On Send", "Connect one root On Send activation to Generate Reply. This workflow starts during SillyTavern message generation."),
	NATIVE_OWNER_MISSING: Ra("native-start", "Starts with a message", "This step starts when you send a message. Enable Lattice, then send a message in SillyTavern to run this workflow."),
	OVERLAPPING_GENERATION: La("generation-overlap", "Generations overlapped", "Another generation started before this workflow finished. Wait for the active generation to finish before starting another."),
	GUIDANCE_OVERFLOW: La("guidance-budget", "Guidance exceeds the budget", "The guidance exceeds Token budget at Generate Reply. Reduce the guidance or increase Token budget in Details."),
	READ_ONLY: Va,
	READ_ONLY_DEFINITION: Va
};
for (let e of [
	"DANGLING_WIRE",
	"INVALID_WIRE",
	"INVALID_PORT",
	"CONFIGURATION_PORT_CHANGED"
]) Ha[e] = za;
for (let e of [
	"DEFINITION_REF",
	"DEFINITION_HASH",
	"DEFINITION_DATA",
	"DEFINITION_METADATA",
	"DEFINITION_BODY",
	"DEFINITION_INTERFACE",
	"DEFINITION_PARAMETER",
	"INVALID_OVERRIDE",
	"LOCAL_COPY_OWNERSHIP"
]) Ha[e] = Ba;
for (let e of [
	"GRAPH_LIMIT",
	"DEFINITION_LIMIT",
	"OUTPUT_LIMIT",
	"INPUT_LIMIT_EXCEEDED",
	"EVIDENCE_LIMIT",
	"EFFECT_BUNDLE_LIMIT",
	"EFFECT_PREVIEW_LIMIT"
]) Ha[e] = La("workflow-limit", "Workflow exceeds a size limit", "This workflow or its data exceeds a supported size limit. Simplify the selected workflow or reduce its input data.");
//#endregion
//#region src/ui/diagnostic-copy.js?v=0.27.0
var Ua = Object.freeze({
	id: "unknown",
	severity: "error",
	title: "Action could not be completed",
	message: "Lattice could not complete this action. Check the workflow and its settings for more information."
}), Wa = {
	id: "save-status-unverified",
	severity: "warning",
	title: "Saving is not confirmed",
	message: "The stored result could not be verified. Confirm the stored data before making another write."
}, Ga = [
	[
		"RECALL_HOTKEY_CONFLICT",
		/^R is reserved for Run to here\. Choose a different key\.$/,
		{
			id: "recall-shortcut-reserved",
			severity: "error",
			title: "Shortcut key is reserved",
			message: "R is reserved for Run to here. Choose a different key in the Recall Shortcut’s Details."
		}
	],
	[
		"INVALID_EFFECT_RESULT",
		/persistence|verified status/i,
		Wa
	],
	[
		"INVALID_FILE_BACKEND_RESULT",
		/CAS|acknowledge|durable/i,
		Wa
	],
	[
		"INVALID_MEMORY_BACKEND_RESULT",
		/CAS|acknowledge/i,
		Wa
	],
	[
		"INVALID_PORT",
		/editable subgraph|boundary whose port/i,
		{
			id: "boundary-port",
			severity: "error",
			title: "Open an editable subgraph",
			message: "Open an editable subgraph and select its Input or Output boundary to edit the port."
		}
	],
	[
		"FILE_NOT_FOUND",
		/logical document|creation template/i,
		{
			id: "logical-document-missing",
			severity: "error",
			title: "Workflow document is missing",
			message: "Choose an existing document or configure an initial template in Workflow Data before reading this target."
		}
	],
	[
		"MISSING_INPUT",
		/wrapper output.*no connected source/i,
		{
			id: "subgraph-output-missing",
			severity: "error",
			title: "Subgraph output needs a source",
			message: "Open the subgraph and connect a source to its Output boundary before previewing this output."
		}
	],
	[
		"STALE_SOURCE",
		/memory/i,
		{
			id: "memory-source-changed",
			severity: "error",
			title: "Memory evidence changed",
			message: "The memory evidence changed after it was read. Inspect the current memory and its source before preparing another change."
		}
	]
], Ka = {
	APPLY_UNVERIFIED: {
		id: "apply-unverified",
		severity: "warning",
		title: "Reply application is not confirmed",
		message: "Reply application could not be confirmed. Check the current reply and save status before making another write."
	},
	ACCEPTED_SAVE_UNVERIFIED: {
		id: "accepted-save-unverified",
		severity: "warning",
		title: "Saving is not confirmed",
		message: "The accepted reply remains. The save outcome could not be confirmed. Check the stored data before making another write."
	},
	PUBLICATION_UNKNOWN: Wa,
	EFFECT_WRITE_UNKNOWN: Wa,
	STALE_SOURCE: {
		id: "review-source-changed",
		severity: "error",
		title: "Review is out of date",
		message: "The chat, reply, swipe, or prompt changed after this candidate was prepared. This review cannot be applied. Prepare a new candidate from the current source; running model steps again makes another model request."
	},
	MISSING_INPUT: {
		id: "missing-input",
		severity: "error",
		title: "Input needs a connection",
		message: "This step needs an input. Connect a compatible output to that input.",
		technical: "A required input has no connected source."
	}
}, qa = {
	...xa,
	...Da,
	...Fa,
	...Ha,
	...Ka
}, Ja = {
	id: "send-required",
	severity: "info",
	title: "Starts with a message",
	message: "Send a message in SillyTavern to run this workflow."
}, Ya = new Map(Ea.filter(([, , e]) => [
	"summary-truncated",
	"summary-unverified",
	"summary-empty",
	"compression-request",
	"compactor-settings"
].includes(e.id)).map(([e, , t]) => [e, t])), Xa = /* @__PURE__ */ new Map();
Xa.set(Ja.message, Ja);
for (let e of [
	...Object.values(qa),
	...Ea.map((e) => e[2]),
	...Ga.map((e) => e[2]),
	...Sa.values()
]) Xa.set(e.message, e);
function Za(e, t) {
	if (t.enabled && [
		"MANUAL_NATIVE_TRIGGER_REQUIRED",
		"NATIVE_OWNER_MISSING",
		"NATIVE_SEND_REQUIRED"
	].includes(e.code)) return Ja;
	for (let [t, n, r] of Ga) if (e.code === t && n.test(e.message)) return r;
	for (let [t, n, r] of Ea) if (e.code === t && n.test(e.message)) return r;
	if (t.operation === "smart-compactor" && Ya.has(e.code)) return Ya.get(e.code);
	if (e.code === "MISSING_INPUT" && (t.nodeTitle || t.inputLabel)) return {
		id: "missing-input",
		severity: "error",
		title: "Input needs a connection",
		message: `${t.nodeTitle || "This step"} needs ${t.inputLabel || "an input"}. Connect a compatible output to that input.`,
		technical: "A required input has no connected source."
	};
	let n = [
		"text",
		"context",
		"draft",
		"patches",
		"guidance",
		"data",
		"activation"
	];
	return e.code === "ARTIFACT_KIND" && n.includes(t.outputType) && n.includes(t.inputType) ? {
		id: "wire-type",
		severity: "error",
		title: "Connection types do not match",
		message: `This output carries ${t.outputType}, but this input needs ${t.inputType}. Connect pins with compatible types.`,
		technical: "The output and input types do not match."
	} : e.code.startsWith("PREVIEW_") && !qa[e.code] ? {
		id: "preview-state",
		severity: "info",
		title: "Preview status",
		message: "Check the selected output’s current preview status."
	} : qa[e.code] ?? Sa.get(e.message) ?? Xa.get(e.message) ?? Ua;
}
//#endregion
//#region src/ui/diagnostics.js
var Qa = (e, t) => {
	try {
		let n = Object.getOwnPropertyDescriptor(e, t);
		return n && "value" in n ? n.value : void 0;
	} catch {
		return;
	}
}, $a = (e) => {
	try {
		return !!e && typeof e == "object" && [Object.prototype, null].includes(Object.getPrototypeOf(e));
	} catch {
		return !1;
	}
}, eo = (e, t = 4096) => typeof e == "string" ? e.slice(0, t) : "", to = (e) => {
	let t = eo(e, 160).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
	return /(?:api[_ -]?key|authorization|bearer\s|password|secret\s*[=:]|sk-[\w-]+)/i.test(t) ? "" : t;
};
function no(e) {
	if (typeof e == "string") {
		let t = eo(e), n = /^([A-Z][A-Z0-9_]{0,63}):\s*(.*)$/s.exec(t);
		return {
			code: n?.[1] || "",
			message: n?.[2] ?? t,
			nodeId: ""
		};
	}
	if (!$a(e)) return {
		code: "",
		message: "",
		nodeId: ""
	};
	let t = Qa(e, "code");
	return {
		code: typeof t == "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(t) ? t : "",
		message: eo(Qa(e, "message")),
		nodeId: eo(Qa(e, "nodeId"), 256),
		address: ro(Qa(e, "address"))
	};
}
function ro(e) {
	if (!$a(e)) return;
	let t = eo(Qa(e, "workflowId"), 256), n = eo(Qa(e, "nodeId"), 256), r = Qa(e, "instancePath"), i = Qa(r, "length");
	if (!t || !n || !Array.isArray(r) || !Number.isSafeInteger(i) || i > 8) return;
	let a = [];
	for (let e = 0; e < i; e++) {
		let t = Qa(r, String(e));
		if (typeof t != "string" || !t || t.length > 256) return;
		a.push(t);
	}
	return {
		workflowId: t,
		instancePath: a,
		nodeId: n
	};
}
function io(e) {
	if (!$a(e)) return {};
	let t = {};
	for (let n of [
		"operation",
		"nodeTitle",
		"inputLabel",
		"outputType",
		"inputType",
		"action"
	]) t[n] = to(Qa(e, n));
	return t.enabled = Qa(e, "enabled") === !0, t;
}
var ao = (e) => JSON.stringify([
	e.code,
	e.message,
	e.address ?? e.nodeId
]);
function oo(e) {
	let t = 2166136261;
	for (let n = 0; n < e.length; n++) t = Math.imul(t ^ e.charCodeAt(n), 16777619);
	return (t >>> 0).toString(36);
}
function so(e, t = {}) {
	let n = no(e), r = Za(n, io(t));
	return {
		id: `${r.id}-${oo(ao(n))}`,
		severity: r.severity,
		title: r.title,
		message: r.message,
		technical: n.code ? {
			code: n.code,
			message: r.id === "unknown" ? "No safe technical description is available for this error." : r.technical ?? r.message
		} : null,
		...n.address ? { address: n.address } : {}
	};
}
function co(e, t = {}) {
	return so(e, t).message;
}
function lo(e, t = {}) {
	if (!Array.isArray(e)) return [];
	let n = [], r = /* @__PURE__ */ new Set(), i = Math.min(Qa(e, "length") || 0, 1e3);
	for (let a = 0; a < i; a++) {
		let i = Qa(e, String(a)), o = ao(no(i));
		r.has(o) || (r.add(o), n.push(so(i, t)));
	}
	return n;
}
//#endregion
//#region ui/DiagnosticMessage.svelte
var uo = /* @__PURE__ */ G("<code class=\"svelte-i9ibmv\"> </code>"), fo = /* @__PURE__ */ G("<p class=\"svelte-i9ibmv\"> </p>"), po = /* @__PURE__ */ G("<details class=\"svelte-i9ibmv\"><summary class=\"svelte-i9ibmv\">Technical details</summary><!><!></details>"), mo = /* @__PURE__ */ G("<button type=\"button\" class=\"svelte-i9ibmv\">Show node</button>"), ho = /* @__PURE__ */ G("<div class=\"pc-diagnostic svelte-i9ibmv\"><strong class=\"svelte-i9ibmv\"><span class=\"pc-diagnostic-severity\"> </span> </strong> <p class=\"svelte-i9ibmv\"> </p> <!> <!></div>");
function go(e, t) {
	Ue(t, !0);
	let n = Pi(t, "context", 19, () => ({})), r = /* @__PURE__ */ F(() => t.diagnostic ?? so(t.issue, n())), i = /* @__PURE__ */ F(() => H(r).address), a = /* @__PURE__ */ F(() => !!(t.reveal && H(i) && typeof H(i).workflowId == "string" && H(i).workflowId.trim() && H(i).workflowId.length <= 256 && typeof H(i).nodeId == "string" && H(i).nodeId.trim() && H(i).nodeId.length <= 256 && Array.isArray(H(i).instancePath) && H(i).instancePath.length <= 8 && H(i).instancePath.every((e) => typeof e == "string" && e.trim() && e.length <= 256))), o = (e) => ({
		info: "Information",
		warning: "Warning",
		error: "Error"
	})[e];
	var s = ho(), c = R(s), l = R(c), u = R(l);
	P(l);
	var d = B(l);
	P(c);
	var f = B(c, 2), p = R(f, !0);
	P(f);
	var m = B(f, 2), h = (e) => {
		var t = po(), n = B(R(t)), i = (e) => {
			var t = uo(), n = R(t, !0);
			P(t), V(() => q(n, H(r).technical.code)), K(e, t);
		};
		J(n, (e) => {
			H(r).technical.code && e(i);
		});
		var a = B(n), o = (e) => {
			var t = fo(), n = R(t, !0);
			P(t), V(() => q(n, H(r).technical.message)), K(e, t);
		};
		J(a, (e) => {
			H(r).technical.message && e(o);
		}), P(t), K(e, t);
	};
	J(m, (e) => {
		H(r).technical && e(h);
	});
	var g = B(m, 2), _ = (e) => {
		var n = mo();
		W("click", n, () => {
			H(a) && H(i) && t.reveal?.({
				...H(i),
				instancePath: [...H(i).instancePath]
			});
		}), K(e, n);
	};
	J(g, (e) => {
		H(a) && e(_);
	}), P(s), V((e) => {
		Z(s, "data-diagnostic", H(r).id), Z(s, "data-severity", H(r).severity), q(u, `${e ?? ""}:`), q(d, ` ${H(r).title ?? ""}`), q(p, H(r).message);
	}, [() => o(H(r).severity)]), K(e, s), We();
}
Er(["click"]);
//#endregion
//#region ui/NodeProfilePicker.svelte
var _o = /* @__PURE__ */ G("<div class=\"node-model-meta svelte-jdmiua\"> </div>"), vo = /* @__PURE__ */ Fr("<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" class=\"svelte-jdmiua\"><path d=\"m5 12 4 4L19 6\" class=\"svelte-jdmiua\"></path></svg>"), yo = /* @__PURE__ */ G("<button type=\"button\" role=\"option\"><span class=\"profile-option-copy svelte-jdmiua\"><span class=\"profile-name svelte-jdmiua\"> </span><span class=\"profile-meta svelte-jdmiua\"> </span></span><span class=\"profile-check svelte-jdmiua\"><!></span></button>"), bo = /* @__PURE__ */ G("<p class=\"profile-empty svelte-jdmiua\"> </p>"), xo = /* @__PURE__ */ G("<div class=\"profile-error svelte-jdmiua\"><!></div>"), So = /* @__PURE__ */ G("<div class=\"profile-menu svelte-jdmiua\"><div class=\"profile-search svelte-jdmiua\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" class=\"svelte-jdmiua\"><circle cx=\"10\" cy=\"10\" r=\"6\" class=\"svelte-jdmiua\"></circle><path d=\"m15 15 5 5\" class=\"svelte-jdmiua\"></path></svg><input role=\"combobox\" aria-label=\"Search connection profiles\" aria-autocomplete=\"list\" aria-expanded=\"true\" placeholder=\"Search connection profiles…\" autocomplete=\"off\" spellcheck=\"false\" maxlength=\"200\" class=\"svelte-jdmiua\"/></div> <div class=\"profile-options svelte-jdmiua\" role=\"listbox\" aria-label=\"Connection profiles\"></div> <!></div>"), Co = /* @__PURE__ */ G("<div class=\"pc-node-profile svelte-jdmiua\" role=\"group\" aria-label=\"Node connection profile\"><!> <div class=\"profile-picker svelte-jdmiua\"><button type=\"button\" class=\"profile-bar svelte-jdmiua\" aria-haspopup=\"listbox\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" class=\"svelte-jdmiua\"><path d=\"M12 22v-5M15 8V2M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1zM9 8V2\" class=\"svelte-jdmiua\"></path></svg><span class=\"profile-value svelte-jdmiua\"> </span><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" class=\"svelte-jdmiua\"><path d=\"m6 9 6 6 6-6\" class=\"svelte-jdmiua\"></path></svg></button> <!></div></div>");
function wo(e, t) {
	Ue(t, !0);
	let n = /* @__PURE__ */ I(!1), r = /* @__PURE__ */ I(""), i = /* @__PURE__ */ I(0), a = /* @__PURE__ */ I(""), o = /* @__PURE__ */ I(!1), s = -1, c = 0, l = !1, u = /* @__PURE__ */ I(35), d, f, p = /* @__PURE__ */ I(void 0), m = /* @__PURE__ */ I(void 0), h = (e) => e.stopPropagation();
	function g(e) {
		let t = (e) => {
			te(e);
		}, n = (t) => {
			t.detail !== e && A();
		}, r = (t) => {
			l && !e.contains(t.target) && (c++, l = !1);
		}, i = [
			"keyup",
			"pointerdown",
			"mousedown",
			"mouseup",
			"mousemove",
			"dblclick",
			"contextmenu"
		];
		e.addEventListener("keydown", t), window.addEventListener("pc-node-profile-open", n), document.addEventListener("focusin", r);
		for (let t of i) e.addEventListener(t, h);
		return { destroy() {
			e.removeEventListener("keydown", t), window.removeEventListener("pc-node-profile-open", n), document.removeEventListener("focusin", r);
			for (let t of i) e.removeEventListener(t, h);
		} };
	}
	let _ = /* @__PURE__ */ F(() => H(r).toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)), v = /* @__PURE__ */ F(() => [...t.row.options.filter((e) => e.active), ...t.row.options.filter((e) => !e.active && H(_).every((t) => `${e.label} ${e.apiLabel} ${e.model}`.toLocaleLowerCase().includes(t)))]), y = /* @__PURE__ */ F(() => Math.max(1, Math.min(330, t.row.visibleBounds.w - 16))), b = /* @__PURE__ */ F(() => Math.max(t.row.visibleBounds.x + 8, Math.min(t.row.x, t.row.visibleBounds.x + t.row.visibleBounds.w - H(y) - 8)) - t.row.x), x = /* @__PURE__ */ F(() => t.row.h + t.row.clearance + 7), S = /* @__PURE__ */ F(() => t.row.visibleBounds.y + t.row.visibleBounds.h - (t.row.y + H(x) + H(u) + 6) - 8), C = /* @__PURE__ */ F(() => t.row.y + H(x) - t.row.visibleBounds.y - 14), w = /* @__PURE__ */ F(() => H(S) < 130 && H(C) > H(S)), T = /* @__PURE__ */ F(() => Math.max(H(C), H(S)) < 78), E = /* @__PURE__ */ F(() => Math.max(0, H(T) ? t.row.visibleBounds.h - 16 : H(w) ? H(C) : H(S))), D = /* @__PURE__ */ F(() => Math.max(0, Math.min(244, H(E) - 54))), O = /* @__PURE__ */ F(() => t.row.visibleBounds.y + 8 - t.row.y - H(x)), k = (e) => `${t.row.id}-profile-option-${e}`;
	function A(e = !1, t = !1) {
		t || (c++, l = !1), L(n, !1), L(r, ""), L(a, ""), L(o, !1), e && f?.focus({ preventScroll: !0 });
	}
	async function j() {
		if (!t.row.editable) return;
		let e = t.row.selection.selectionKey;
		if (await t.refreshProfiles?.(t.row.selection), !t.row.editable || !d?.isConnected || t.row.selection.selectionKey !== e) return;
		let c = f.getBoundingClientRect(), l = c.width > 0 && t.row.w > 0 ? c.width / t.row.w : 1;
		L(u, c.height > 0 ? c.height / l : 35, !0), window.dispatchEvent(new CustomEvent("pc-node-profile-open", { detail: d })), s = t.row.authorityVersion, L(r, ""), L(a, ""), L(o, !1), L(i, Math.max(0, H(v).findIndex((e) => e.value === t.row.value)), !0), L(n, !0), await mr(), H(n) && (H(p)?.focus({ preventScroll: !0 }), H(m) && (H(m).scrollTop = 0));
	}
	function M() {
		let e = H(v).find((e) => e.active);
		L(i, !H(_).length || e && H(_).every((t) => e.label.toLocaleLowerCase().includes(t)) ? 0 : H(v).length > 1 ? 1 : -1, !0), H(m) && (H(m).scrollTop = 0);
	}
	async function ee(e) {
		if (!H(n) || !t.row.editable || H(o) || t.row.authorityVersion !== s || !t.editProfile) return;
		let r = s, i = t.row.selection, u = c;
		L(o, !0), L(a, ""), l = !0;
		try {
			let o = await t.editProfile(i, e.value);
			if (o.ok) {
				c === u && d?.isConnected && t.row.selection.selectionKey === i.selectionKey && JSON.stringify(t.row.selection.address) === JSON.stringify(i.address) && (!H(n) || s === r) && A(!0);
				return;
			}
			if (!H(n) || t.row.authorityVersion !== r) return;
			L(a, o.error.code + ": " + o.error.message);
		} catch (e) {
			H(n) && t.row.authorityVersion === r && L(a, e instanceof Error ? e.message : "Could not change connection profile", !0);
		} finally {
			t.row.authorityVersion === r && L(o, !1), c === u && (l = !1);
		}
	}
	async function te(e) {
		h(e), H(n) ? e.key === "Escape" ? (e.preventDefault(), A(!0)) : e.key === "ArrowDown" || e.key === "ArrowUp" ? (e.preventDefault(), L(i, Math.max(0, Math.min(H(v).length - 1, H(i) + (e.key === "ArrowDown" ? 1 : -1))), !0), await mr(), H(m)?.querySelector(".is-active")?.scrollIntoView?.({ block: "nearest" }), H(p)?.focus({ preventScroll: !0 })) : e.key === "Enter" && e.target === H(p) && (e.preventDefault(), H(v)[H(i)] && await ee(H(v)[H(i)])) : [
			"ArrowDown",
			"ArrowUp",
			"Enter",
			" "
		].includes(e.key) && (e.preventDefault(), await j());
	}
	function ne(e) {
		e.preventDefault(), h(e), H(m) && (H(m).scrollTop += e.deltaY * (e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? H(m).clientHeight : 1));
	}
	Cn(() => {
		H(n) && (t.row.authorityVersion !== s || !t.row.editable) && A(!1, !0);
	});
	var re = Co();
	U("pointerdown", on, (e) => {
		(H(n) || l) && !d.contains(e.target) && A();
	});
	let ie;
	var ae = R(re), oe = (e) => {
		var n = _o(), r = R(n, !0);
		P(n), V(() => {
			Z(n, "title", t.row.model), q(r, t.row.model);
		}), K(e, n);
	};
	J(ae, (e) => {
		t.row.model && e(oe);
	});
	var se = B(ae, 2);
	let ce;
	var le = R(se), ue = B(R(le)), de = R(ue, !0);
	P(ue), Me(), P(le), Ni(le, (e) => f = e, () => f);
	var fe = B(le, 2), pe = (e) => {
		var n = So();
		let s;
		var c = R(n), l = B(R(c));
		X(l), Ni(l, (e) => L(p, e), () => H(p)), P(c);
		var d = B(c, 2);
		let f;
		Y(d, 23, () => H(v), (e) => e.value, (e, n, r) => {
			var a = yo();
			let s;
			var c = R(a), l = R(c), u = R(l, !0);
			P(l);
			var d = B(l), f = R(d, !0);
			P(d), P(c);
			var p = B(c), m = R(p), h = (e) => {
				K(e, vo());
			};
			J(m, (e) => {
				H(n).value === t.row.value && e(h);
			}), P(p), P(a), V((e, c) => {
				Z(a, "id", e), s = pi(a, 1, "profile-option svelte-jdmiua", null, s, { "is-active": H(r) === H(i) }), Z(a, "aria-selected", H(n).value === t.row.value), a.disabled = H(o), Z(l, "title", H(n).label), q(u, H(n).label), q(f, c);
			}, [() => k(H(r)), () => H(n).active ? "Follows SillyTavern’s current model" : [H(n).apiLabel, H(n).model].filter(Boolean).join(" · ")]), W("click", a, () => ee(H(n))), K(e, a);
		}, (e) => {
			var t = bo(), n = R(t, !0);
			P(t), V((e) => q(n, e), [() => H(r).trim() ? "No connection profiles match. Clear the search to see available profiles." : "No connection profiles are available. Add one in SillyTavern’s Connection Manager."]), K(e, t);
		}), P(d), Ni(d, (e) => L(m, e), () => H(m));
		var h = B(d, 2), g = (e) => {
			var t = xo();
			go(R(t), { get issue() {
				return H(a);
			} }), P(t), K(e, t);
		};
		J(h, (e) => {
			H(a) && e(g);
		}), P(n), V((e) => {
			s = hi(n, "", s, {
				width: `${H(y)}px`,
				"max-height": `${H(E)}px`,
				left: `${H(b)}px`,
				top: H(T) ? `${H(O)}px` : H(w) ? "auto" : `${H(u) + 6}px`,
				bottom: !H(T) && H(w) ? `${H(u) + 6}px` : "auto"
			}), Z(l, "aria-controls", `${t.row.id}-profile-list`), Z(l, "aria-activedescendant", e), Z(d, "id", `${t.row.id}-profile-list`), f = hi(d, "", f, { "max-height": `${H(D)}px` });
		}, [() => H(i) >= 0 && H(v).length ? k(H(i)) : void 0]), W("input", l, M), ki(l, () => H(r), (e) => L(r, e)), U("wheel", d, ne), K(e, n);
	};
	J(fe, (e) => {
		H(n) && e(pe);
	}), P(se), P(re), Ni(re, (e) => d = e, () => d), ii(re, (e) => g?.(e)), V(() => {
		Z(re, "data-id", t.row.id), ie = hi(re, "", ie, {
			left: `${t.row.x}px`,
			top: `${t.row.y}px`,
			width: `${t.row.w}px`,
			"z-index": H(n) ? 20 : 2
		}), ce = hi(se, "", ce, { top: `${H(x)}px` }), Z(le, "title", t.row.label), Z(le, "aria-label", `Connection profile: ${t.row.label}`), Z(le, "aria-expanded", H(n)), le.disabled = !t.row.editable, q(de, t.row.label);
	}), U("wheel", re, h), W("click", le, () => H(n) ? A() : j()), K(e, re), We();
}
Er(["click", "input"]);
//#endregion
//#region ui/CanvasLayer.svelte
var To = /* @__PURE__ */ G("<div class=\"pc-viewport\" data-pc-renderer=\"svelte\"><div class=\"pc-comment-layer svelte-o7b704\"></div> <svg class=\"pc-wires\" aria-label=\"Canvas connections\"><!></svg> <div class=\"pc-nodes\"><!> <!> <!></div> <div class=\"pc-node-profile-layer svelte-o7b704\"></div></div>");
function Eo(e, t) {
	Ue(t, !0);
	class n {
		id;
		#e = /* @__PURE__ */ I(null);
		get value() {
			return H(this.#e);
		}
		set value(e) {
			L(this.#e, e);
		}
		constructor(e) {
			this.id = e.id, this.value = e;
		}
	}
	let r = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ I([]), s = /* @__PURE__ */ I([]), c = /* @__PURE__ */ I([]), l = /* @__PURE__ */ I({}), u = /* @__PURE__ */ I({}), d = /* @__PURE__ */ I(null), f = /* @__PURE__ */ I([]), p = /* @__PURE__ */ I([]), m = /* @__PURE__ */ I({
		select() {},
		update() {},
		command() {}
	}), h = /* @__PURE__ */ I(null), g = /* @__PURE__ */ I({
		w: 4e3,
		h: 4e3
	}), _, v, y, b;
	function x() {
		return {
			viewport: _,
			svg: v,
			nodeLayer: y,
			commentLayer: b
		};
	}
	function S(e, t) {
		L(f, Li(e, H(f), a, (e) => new n(e))), L(m, t);
	}
	function C(e) {
		L(l, e);
	}
	function w(e) {
		L(h, e);
	}
	function T(e) {
		e.nodes && O(e.nodes), e.comments && L(f, Li(e.comments, H(f), a, (e) => new n(e))), e.commentActions && L(m, e.commentActions), e.groups && A(e.groups), e.wires && L(c, e.wires), e.bounds && L(g, e.bounds), "ghost" in e && L(h, e.ghost ?? null), e.nodeProfiles && L(p, e.nodeProfiles);
	}
	function E(e) {
		L(u, e);
	}
	function D(e) {
		L(d, e, !0);
	}
	function O(e) {
		L(o, Li(e, H(o), r, (e) => new n(e)));
	}
	function k(e) {
		L(p, e);
	}
	function A(e) {
		L(s, Li(e, H(s), i, (e) => new n(e)));
	}
	function j(e, t, n) {
		L(c, e), L(g, t), L(h, n);
	}
	function M(e, t) {
		for (let t of e) for (let e of [r, a]) {
			let n = e.get(t.id);
			n && (n.value = {
				...n.value,
				...t
			});
		}
		for (let e of t) {
			let t = i.get(e.id);
			t && (t.value = {
				...t.value,
				...e
			});
		}
	}
	var ee = {
		getLayers: x,
		setComments: S,
		setVisualStatus: C,
		setWirePreview: w,
		applyScene: T,
		setRecallStatus: E,
		setPreviewTarget: D,
		setNodes: O,
		setNodeProfiles: k,
		setGroups: A,
		setWires: j,
		setPositions: M
	}, te = To(), ne = R(te);
	Y(ne, 21, () => H(f), (e) => e.id, (e, t) => {
		ma(e, {
			get comment() {
				return H(t).value;
			},
			get actions() {
				return H(m);
			}
		});
	}), P(ne), Ni(ne, (e) => b = e, () => b);
	var re = B(ne, 2);
	la(R(re), {
		get wires() {
			return H(c);
		},
		get ghost() {
			return H(h);
		}
	}), P(re), Ni(re, (e) => v = e, () => v);
	var ie = B(re, 2), ae = R(ie);
	Y(ae, 17, () => H(s).filter((e) => !e.value.collapsed), (e) => e.id, (e, n) => {
		aa(e, {
			get group() {
				return H(n).value;
			},
			get actions() {
				return t.actions;
			}
		});
	});
	var oe = B(ae, 2);
	Y(oe, 17, () => H(o), (e) => e.id, (e, n) => {
		{
			let r = /* @__PURE__ */ F(() => H(l)[H(n).id]?.status), i = /* @__PURE__ */ F(() => H(d) === H(n).id);
			na(e, {
				get card() {
					return H(n).value;
				},
				get recall() {
					return H(u)[H(n).id];
				},
				get status() {
					return H(r);
				},
				get targeted() {
					return H(i);
				},
				get actions() {
					return t.actions;
				}
			});
		}
	}), Y(B(oe, 2), 17, () => H(s).filter((e) => e.value.collapsed), (e) => e.id, (e, n) => {
		aa(e, {
			get group() {
				return H(n).value;
			},
			get actions() {
				return t.actions;
			}
		});
	}), P(ie), Ni(ie, (e) => y = e, () => y);
	var se = B(ie, 2);
	return Y(se, 21, () => H(p), (e) => e.id, (e, n) => {
		wo(e, {
			get row() {
				return H(n);
			},
			get editProfile() {
				return t.actions.editProfile;
			},
			get refreshProfiles() {
				return t.actions.refreshProfiles;
			}
		});
	}), P(se), P(te), Ni(te, (e) => _ = e, () => _), V(() => {
		Z(re, "width", H(g).w), Z(re, "height", H(g).h), Z(re, "viewBox", `0 0 ${H(g).w} ${H(g).h}`);
	}), K(e, te), We(ee);
}
//#endregion
//#region ui/workspace-menu-model.ts
var Do = {
	new: "yellow",
	save: "blue",
	"save-as": "blue",
	"download-document": "blue",
	export: "blue",
	"export-archived-workflows": "blue",
	"delete-selection": "red",
	"reset-layout": "green",
	theme: "purple",
	"add-node": "blue",
	"details-selection": "blue",
	"add-system": "purple",
	"create-subgraph": "purple",
	"save-subgraph": "blue",
	"comment-selection": "yellow",
	"add-comment": "yellow",
	"manage-portals": "purple",
	"validate-workflow": "green",
	"review-host-result": "blue",
	"stop-workflow": "red",
	"run-preview": "green",
	configure: "blue",
	"story-documents": "teal",
	"memory-recall-menu": "purple",
	"recall-queue-selected": "green",
	"recall-queue-all": "green",
	"recall-cancel-selected": "red",
	"recall-cancel-all": "red",
	"memory-recall": "purple",
	help: "blue"
}, Q = (e, t, n = "", r = !1, i = "") => ({
	label: e,
	command: t,
	icon: n,
	iconTone: Do[t],
	disabled: r,
	shortcut: i
}), Oo = (e, t, n, r = !1, i = "check") => ({
	label: e,
	command: t,
	checked: n,
	disabled: r,
	kind: i
});
function ko(e, t = {
	previewOpen: !0,
	shelfOpen: !0
}) {
	let n = e.menuCapabilities ?? {}, r = e.rootWorkflow ?? e.workflow, i = e.outputPreview, a = !!e.readOnly, o = !!r?.ownedBusy, s = e.document, c = e.recall?.commands.selected, l = e.recall?.commands.all;
	return [
		{
			name: "File",
			groups: [
				[
					Q("New workflow", "new", "add", !!s?.busy, "Ctrl N"),
					Q("Open workflow…", "open-workflow", "open", !!s?.busy, "Ctrl O"),
					{
						...Q("Open Recent", "recent-menu", "open", !s?.native || !s.recents.length || s.busy),
						children: [...(s?.recents ?? []).map((e) => Q(e.name, "open-recent:" + e.id, "open")), {
							...Q("Clear Recent", "clear-recent", "clear"),
							title: "Files stay on disk; only this recent list is cleared."
						}]
					},
					Q("Open examples…", "examples", "library", !!s?.busy)
				],
				[{
					...Q("Recover previous workflows", "recovery-menu", "library", !s?.recovery.length || s.busy),
					children: (s?.recovery ?? []).map((e) => ({
						...Q(e.name, "recover-workflow:" + e.id, "open"),
						reason: e.issue ? co(e.issue) : void 0
					}))
				}],
				[...s?.native ? [Q("Save workflow", "save", "save", s.busy, "Ctrl S"), Q("Save As…", "save-as", "save", s.busy, "Ctrl Shift S")] : [Q("Save As…", "download-document", "save", !!s?.busy, "Ctrl S")], Q("Rename workflow…", "rename", "rename", !r)],
				[
					Q("Import into graph…", "import-into-graph", "open", a),
					Q("Export workflow JSON…", "export", "export", !r),
					...e.hasArchivedWorkflows ? [Q("Export archived workflows", "export-archived-workflows", "export")] : []
				],
				[Q("Close workspace", "close", "close")]
			]
		},
		{
			name: "Edit",
			groups: [
				[Q("Undo", "undo", "undo", !e.history.undo, "Ctrl Z"), Q("Redo", "redo", "redo", !e.history.redo, "Ctrl Shift Z")],
				[
					Q("Cut", "cut", "cut", !e.selectionActions?.cut, "Ctrl X"),
					Q("Copy", "copy", "copy", !e.selectionActions?.copy, "Ctrl C"),
					Q("Paste", "paste", "paste", a, "Ctrl V"),
					Q("Duplicate selection", "duplicate-selection", "duplicate", !n.duplicate, "Ctrl D"),
					{
						...Q("Delete selection", "delete-selection", "delete", !e.selectionActions?.delete, "Del"),
						tone: "danger"
					}
				],
				[Q("Select all", "select-all", "select", !1, "Ctrl A"), Q("Clear selection", "clear-selection", "clear", !n.hasSelection)]
			]
		},
		{
			name: "View",
			groups: [
				[
					Oo("Show Details", "inspector", !!e.inspectorOpen),
					Oo("Show preview", "toggle-preview", t.previewOpen),
					Oo("Show node shelf", "toggle-shelf", t.shelfOpen)
				],
				[Oo("Follow selection", "follow-preview", i?.followSelection ?? !0, !i, "radio"), Oo("Pin current output", "pin-preview", !!i?.pinned, !i?.selectedKey || i?.status === "removed", "radio")],
				[
					Q("Fit graph", "fit", "fit"),
					Q("Fit selection", "fit-selection", "fit", !n.fitSelection, "F"),
					Q("Center selection", "center-selection", "fit", !n.hasSelection),
					Q("Zoom in", "zoom-in", "add", !1, "]"),
					Q("Zoom out", "zoom-out", "minus", !1, "[")
				],
				[Q("Reset panel layout", "reset-layout", "reset"), Q("Theme and colours…", "theme", "theme")]
			]
		},
		{
			name: "Graph",
			groups: [
				[
					Q("Add node…", "add-node", "add", a),
					Q("Details for selection", "details-selection", "details", !n.inspect),
					Q("Rename selection…", "rename-selection", "rename", !n.rename, "F2")
				],
				[
					Q("Group selection", "group-selection", "group", !n.group, "Ctrl G"),
					Q("Ungroup selection", "ungroup-selection", "ungroup", !n.ungroup, "Ctrl Shift G"),
					Q("Create subgraph", "create-subgraph", "subgraph", !n.createSubgraph),
					Q("Save subgraph…", "save-subgraph", "save", !n.saveSubgraph)
				],
				[
					Q("Comment selection", "comment-selection", "comment", !n.comment, "C"),
					Q("Add comment", "add-comment", "comment", a),
					Q("Manage portals…", "manage-portals", "portals")
				],
				[
					Oo("Select tool", "select-tool", e.camera?.mode !== "pan", !1, "radio"),
					Oo("Pan tool", "pan-tool", e.camera?.mode === "pan", !1, "radio"),
					Oo("Compact cards", "compact-selection", !!n.compactChecked, !n.compact)
				]
			]
		},
		{
			name: "Workflow",
			groups: [
				[Q("Add system…", "add-system", "subgraph", !n.addSystem || o)],
				[Oo("Enable Lattice", "enable-workflow", !!e.enabled, !r)],
				[
					Q("Validate workflow", "validate-workflow", "check", !r),
					Q("Review host result", "review-host-result", "details", r?.reviewTerminals ? !r.reviewTerminals.length : !r?.nodes?.some((e) => e.terminal)),
					Q("Stop workflow", "stop-workflow", "stop", !n.stop)
				],
				[{
					...Q("Run to current output", "run-preview", "run", !i?.runHere?.enabled || !!i?.busy || o),
					reason: i?.busy || o ? "Wait for the current run to finish." : i?.runHere?.reason ?? (i?.selectedKey ? void 0 : "Select a node output to preview first.")
				}, Q("Run details…", "run-details", "details", !e.runDetails)],
				[{
					...Q("Configure", "configure", "details"),
					children: [Q("Workflow Data…", "story-documents", "library")]
				}],
				[{
					...Q("Memory recall", "memory-recall-menu", "arm"),
					children: [
						{
							...Q("Queue recall for selected nodes", "recall-queue-selected", "add", !c?.queueNodeIds.length),
							reason: c?.queueNodeIds.length ? void 0 : c?.queueReason || "Select an eligible Recall node first."
						},
						{
							...Q("Cancel recall for selected nodes", "recall-cancel-selected", "clear", !c?.cancelNodeIds.length),
							reason: c?.cancelNodeIds.length ? void 0 : c?.cancelReason || "Select a node with queued recall first."
						},
						{
							...Q("Queue recall for all eligible nodes", "recall-queue-all", "add", !l?.queueNodeIds.length),
							reason: l?.queueNodeIds.length ? void 0 : l?.queueReason || "No Recall nodes are eligible to queue."
						},
						{
							...Q("Cancel all queued recall", "recall-cancel-all", "clear", !l?.cancelNodeIds.length),
							reason: l?.cancelNodeIds.length ? void 0 : l?.cancelReason || "No recall is queued to cancel."
						},
						Q("Memory recall overview…", "memory-recall", "details")
					]
				}]
			]
		},
		{
			name: "Help",
			groups: [[
				Q("Workspace guide", "help", "help"),
				Q("Node reference", "node-reference", "library"),
				Q("Keyboard shortcuts", "shortcuts", "keyboard")
			], [Q("About Lattice", "about", "info")]]
		}
	];
}
var Ao = /* @__PURE__ */ new Set([
	"toggle-preview",
	"toggle-shelf",
	"reset-layout",
	"follow-preview",
	"pin-preview",
	"run-preview",
	"run-details",
	"validate-workflow",
	"help",
	"node-reference",
	"shortcuts",
	"about",
	"examples",
	"add-node",
	"story-documents",
	"memory-recall"
]), jo = {
	target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 1v4 M12 19v4 M1 12h4 M19 12h4",
	details: "M10 5H3 M12 19H3 M14 3v4 M16 17v4 M21 12h-9 M21 19h-5 M21 5h-7 M8 10v4 M8 12H3",
	rename: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z M15 5l4 4",
	duplicate: "M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74z M20 14.285l1.5.845a1 1 0 0 1 0 1.74L13 21.74a2 2 0 0 1-2 0l-8.5-4.87a1 1 0 0 1 0-1.74l1.5-.845",
	copy: "M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
	cut: "M9 6a3 3 0 1 1-6 0a3 3 0 1 1 6 0z M8.12 8.12 12 12 M20 4 8.12 15.88 M9 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0z M14.8 14.8 20 20",
	paste: "M9 4H5v17h14V4h-4 M9 2h6v5H9z M8 12h8 M8 16h5",
	comment: "M22 6H2 M22 18H2 M6 2v20 M18 2v20",
	subgraph: "M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z M7 16.5l-4.74-2.85 M7 16.5l5-3 M7 16.5v5.17 M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z M17 16.5l-5-3 M17 16.5l4.74-2.85 M17 16.5v5.17 M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z M12 8 7.26 5.15 M12 8l4.74-2.85 M12 13.5V8",
	open: "M3 7h7l2 3h9l-3 10H3V7z M3 7V4h7l2 3h7v3",
	save: "M4 3h13l3 3v15H4V3z M8 3v6h8V3 M8 21v-8h8v8",
	edit: "M4 17v3h3L20 7l-3-3L4 17z M14 7l3 3",
	library: "M3 4h4v16H3z M10 4h4v16h-4z M16 5l4-1 3 15-4 1-3-15z",
	export: "M12 15V3 M8 7l4-4 4 4 M4 12v8h16v-8",
	unpack: "M12 3l9 5-9 5-9-5 9-5z M3 8v9l9 5 9-5V8 M12 13v9 M8 3L4 1 M16 3l4-2",
	group: "M3 3h18v18H3z M7 7h4v4H7z M13 13h4v4h-4z",
	ungroup: "M3 8V3h5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5 M7 7h4v4H7z M13 13h4v4h-4z",
	disconnect: "M9 15l6-6 M7 7L3 3 M17 17l4 4 M8 4h6a5 5 0 0 1 5 5v3 M16 20h-6a5 5 0 0 1-5-5v-3",
	portals: "M8 3a5 9 0 1 0 0 18 5 9 0 0 0 0-18z M16 3a5 9 0 1 0 0 18 5 9 0 0 0 0-18z M8 12h8 M13 9l3 3-3 3",
	add: "M12 4v16 M4 12h16",
	fit: "M15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0z M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2",
	compact: "M14 10l7-7 M20 10h-6V4 M3 21l7-7 M4 14h6v6",
	run: "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z",
	pin: "M12 17v5 M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z",
	delete: "M10 11v6 M14 11v6 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
	undo: "M3 10h6 M3 10V4 M3 10a8 8 0 1 1 0 6",
	redo: "M21 10h-6 M21 10V4 M21 10a8 8 0 1 0 0 6",
	close: "M6 6l12 12 M6 18 18 6",
	minus: "M4 12h16",
	select: "M5 3l15 10-8 1-4 7-3-18z",
	clear: "M5 5l14 14 M5 19 19 5",
	reset: "M3 10h6 M3 10V4 M3 10a9 9 0 1 1 0 6",
	theme: "M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h5a3 3 0 0 0 3-3 9 9 0 0 0-9-7z",
	assign: "M3 12h14 M12 7l5 5-5 5 M21 4v16",
	check: "M4 12l5 5L20 6",
	stop: "M5 5h14v14H5z",
	connect: "M7 8h10 M7 16h10 M3 4h4v8H3z M17 12h4v8h-4z",
	arm: "M12 3v9 M6 5a9 9 0 1 0 12 0",
	help: "M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3 M12 17v1 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z",
	keyboard: "M2 5h20v14H2z M6 9h1 M11 9h1 M16 9h1 M6 13h1 M11 13h1 M16 13h1 M7 16h10",
	info: "M12 11v6 M12 7v1 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"
}, Mo = /* @__PURE__ */ Fr("<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" focusable=\"false\"><path></path></svg>"), No = /* @__PURE__ */ G("<small style=\"display:block;white-space:normal;font-size:11px;line-height:1.4\"> </small>"), Po = /* @__PURE__ */ G("<kbd class=\"pc-workspace-menu-shortcut\" aria-hidden=\"true\"> </kbd>"), Fo = /* @__PURE__ */ G("<span class=\"pc-workspace-menu-shortcut\" aria-hidden=\"true\"></span>"), Io = /* @__PURE__ */ G("<button type=\"button\" class=\"pc-workspace-menu-item\" tabindex=\"-1\"><span class=\"pc-workspace-menu-icon\" aria-hidden=\"true\"><!></span> <span class=\"pc-workspace-menu-state\" aria-hidden=\"true\"> </span> <span class=\"pc-workspace-menu-label\"> <!></span> <!> <span class=\"pc-workspace-menu-caret\" aria-hidden=\"true\"> </span></button>"), Lo = /* @__PURE__ */ G("<button type=\"button\" role=\"menuitem\" class=\"pc-flat-menu\" aria-haspopup=\"menu\"> </button>"), Ro = /* @__PURE__ */ G("<div class=\"pc-workspace-menu-separator\" role=\"separator\"></div>"), zo = /* @__PURE__ */ G("<!> <!>", 1), Bo = /* @__PURE__ */ G("<div id=\"pc-workspace-submenu\" class=\"pc-workspace-menu-panel pc-workspace-submenu\" role=\"menu\" tabindex=\"-1\"><!></div>"), Vo = /* @__PURE__ */ G("<div id=\"pc-workspace-menu\" class=\"pc-workspace-menu-panel\" role=\"menu\" tabindex=\"-1\"></div> <!>", 1), Ho = /* @__PURE__ */ G("<div class=\"pc-workspace-menus\" role=\"menubar\" tabindex=\"-1\" aria-label=\"Workspace menus\"><!> <!></div>");
function Uo(e, t) {
	let n = Rr();
	Ue(t, !0);
	let r = (e, t = d, r = d) => {
		var i = Lr();
		Y(z(i), 17, t, qr, (e, t) => {
			var i = Io(), a = R(i), o = R(a), s = (e) => {
				var n = Mo(), r = R(n);
				P(n), V(() => Z(r, "d", jo[H(t).icon])), K(e, n);
			};
			J(o, (e) => {
				H(t).icon && jo[H(t).icon] && e(s);
			}), P(a);
			var c = B(a, 2), l = R(c, !0);
			P(c);
			var u = B(c, 2), d = R(u, !0), f = B(d), m = (e) => {
				var r = No(), i = R(r, !0);
				P(r), V(() => {
					Z(r, "id", n + "-reason-" + H(t).command), q(i, H(t).reason);
				}), K(e, r);
			};
			J(f, (e) => {
				H(t).reason && e(m);
			}), P(u);
			var h = B(u, 2), g = (e) => {
				var n = Po(), r = R(n, !0);
				P(n), V(() => q(r, H(t).shortcut)), K(e, n);
			}, _ = (e) => {
				K(e, Fo());
			};
			J(h, (e) => {
				H(t).shortcut ? e(g) : e(_, -1);
			});
			var v = B(h, 2), y = R(v, !0);
			P(v), P(i), V(() => {
				Z(i, "role", H(t).kind === "radio" ? "menuitemradio" : H(t).kind === "check" ? "menuitemcheckbox" : "menuitem"), Z(i, "title", H(t).title), Z(i, "aria-label", H(t).label), Z(i, "aria-describedby", H(t).reason ? n + "-reason-" + H(t).command : void 0), Z(i, "aria-disabled", !!H(t).disabled), Z(i, "aria-checked", H(t).kind ? !!H(t).checked : void 0), Z(i, "aria-haspopup", H(t).children ? "menu" : void 0), Z(i, "aria-expanded", H(t).children ? H(p) === H(t) : void 0), Z(i, "aria-controls", H(t).children && H(p) === H(t) ? "pc-workspace-submenu" : void 0), Z(i, "data-command", H(t).command), Z(i, "data-tone", H(t).tone), i.disabled = H(t).disabled, Z(a, "data-icon-tone", H(t).iconTone), q(l, H(t).checked ? H(t).kind === "radio" ? "●" : "✓" : ""), q(d, H(t).label), q(y, H(t).children ? "›" : "");
			}), W("click", i, (e) => k(H(t), e.currentTarget)), U("pointerenter", i, (e) => {
				r() || (H(t).children ? O(H(t), e.currentTarget) : L(p, null));
			}), K(e, i);
		}), K(e, i);
	}, i = /* @__PURE__ */ F(() => ko(t.state, t.panels)), a = /* @__PURE__ */ I(""), o = /* @__PURE__ */ I(0), s, c = /* @__PURE__ */ I(null), l = /* @__PURE__ */ I(null), u = null, f = null, p = /* @__PURE__ */ I(null), m = /* @__PURE__ */ I(0), h = /* @__PURE__ */ I(0), g = /* @__PURE__ */ I(0), _ = /* @__PURE__ */ I(0), v = 0, y = "", b = "", x = 0, S = {}, C = /* @__PURE__ */ F(() => `${t.state.menuContextKey ?? ""}:${t.state.graphId}:${t.state.graphViews?.active.key ?? ""}:${t.state.graphViews?.viewEpoch ?? ""}`);
	Cn(() => {
		H(a) && y !== H(C) && T();
	});
	let w = (e) => e ? [...e.querySelectorAll("button:not(:disabled)")] : [];
	function T(e = !1) {
		v++, L(a, ""), L(p, null), b = "", e && u?.isConnected && u.focus({ preventScroll: !0 });
	}
	function E(e, t, n = !1) {
		let r = e.getBoundingClientRect(), i = window.innerWidth, a = window.innerHeight, o = n ? t.right - 1 : t.left, s = n ? t.top : t.bottom + 2;
		return n && o + r.width > i - 4 && (o = t.left - r.width + 1, o < 4 && (o = t.left, s = t.bottom + r.height <= a - 4 ? t.bottom : t.top - r.height)), {
			x: Math.max(4, Math.min(o, i - r.width - 4)),
			y: Math.max(4, Math.min(s, a - r.height - 4))
		};
	}
	async function D(e, n, r = "first", s = !1) {
		if (H(a) === e && s) {
			T(!0);
			return;
		}
		t.actions.resizeStart?.(), L(a, e, !0), L(p, null), u = n, L(o, H(i).findIndex((t) => t.name === e), !0), y = H(C), b = "";
		let l = ++v;
		if (await mr(), l !== v || !H(c)) return;
		let d = E(H(c), n.getBoundingClientRect());
		L(m, d.x, !0), L(h, d.y, !0), r && (r === "last" ? w(H(c)).at(-1) : w(H(c))[0])?.focus();
	}
	async function O(e, n, r = !1) {
		if (e.disabled || !e.children || !H(a)) return;
		e.command === "memory-recall-menu" && t.actions.recall?.refresh(), L(p, e), f = n, b = "";
		let i = v;
		if (await mr(), i !== v || !H(l) || H(p) !== e) return;
		if (e.command === "memory-recall-menu") {
			let e = t.actions.recall?.capture(t.state.recall?.commands.selected.relevantNodeIds ?? []), n = t.actions.recall?.capture(t.state.recall?.commands.all.relevantNodeIds ?? [], "all"), r = () => ({
				ok: !1,
				error: {
					code: "RECALL_UNAVAILABLE",
					message: "Memory recall is unavailable."
				}
			});
			S = {
				"recall-queue-selected": () => e?.queue() ?? r(),
				"recall-cancel-selected": () => e?.cancel() ?? r(),
				"recall-queue-all": () => n?.queue() ?? r(),
				"recall-cancel-all": () => n?.cancel() ?? r()
			};
		}
		let o = E(H(l), n.getBoundingClientRect(), !0);
		L(g, o.x, !0), L(_, o.y, !0), r && w(H(l))[0]?.focus();
	}
	function k(e, n) {
		if (e.disabled || y !== H(C)) return;
		if (e.children) {
			O(e, n, !0);
			return;
		}
		let r = e.command;
		T(!0);
		let i = S[r];
		i ? Promise.resolve(i()).then((e) => {
			e.ok || (t.actions.recall?.reportIssue(e.error.code + ": " + e.error.message), t.actions.recall?.refresh());
		}).catch(() => {
			t.actions.recall?.reportIssue("RECALL_UNAVAILABLE: Memory recall could not be updated."), t.actions.recall?.refresh();
		}) : Ao.has(r) ? t.local(r) : r === "enable-workflow" ? t.actions.setEnabled(!t.state.enabled) : r === "select-tool" || r === "pan-tool" ? t.actions.mode(r === "select-tool" ? "select" : "pan") : r === "zoom-in" || r === "zoom-out" ? t.actions.zoom(r === "zoom-in" ? 1.15 : 1 / 1.15) : r === "fit-selection" ? t.actions.fitSelection() : t.actions.command(r);
	}
	function A(e) {
		return s.querySelector(`[data-menu="${H(i)[e].name}"]`);
	}
	function j(e) {
		if (!H(a) && (e.ctrlKey || e.metaKey)) return;
		e.stopPropagation();
		let t = e.target, n = t.hasAttribute("data-menu");
		if (e.key === "Tab") {
			H(a) && T(!0);
			return;
		}
		if (e.key === "Escape") {
			H(a) && (e.preventDefault(), H(p) && t.closest("[role=\"menu\"]") === H(l) ? (L(p, null), f?.focus({ preventScroll: !0 })) : T(!0));
			return;
		}
		let r = t.closest("[role=\"menu\"]") ?? H(c), s = r === H(l) && !!H(p), u = w(r), d = u.indexOf(t);
		if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
			if (e.preventDefault(), s) {
				e.key === "ArrowLeft" && (L(p, null), f?.focus());
				return;
			}
			if (!n && e.key === "ArrowRight") {
				let e = H(i).find((e) => e.name === H(a))?.groups.flat().find((e) => e.command === t.dataset.command);
				if (e?.children) {
					O(e, t, !0);
					return;
				}
			}
			let r = (H(o) + (e.key === "ArrowRight" ? 1 : H(i).length - 1)) % H(i).length;
			L(o, r), H(a) ? D(H(i)[r].name, A(r)) : A(r).focus();
		} else if ([
			"ArrowDown",
			"ArrowUp",
			"Home",
			"End"
		].includes(e.key)) e.preventDefault(), n ? e.key === "Home" || e.key === "End" ? (L(o, e.key === "Home" ? 0 : H(i).length - 1, !0), A(H(o)).focus()) : D(t.dataset.menu, t, e.key === "ArrowUp" ? "last" : "first") : (s || L(p, null), u[e.key === "Home" ? 0 : e.key === "End" ? u.length - 1 : (d + (e.key === "ArrowUp" ? u.length - 1 : 1)) % u.length]?.focus());
		else if (e.key === "Enter" || e.key === " ") e.preventDefault(), t.click();
		else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
			e.preventDefault();
			let t = Date.now();
			b = (t - x > 700 ? "" : b) + e.key.toLowerCase(), x = t;
			let r = b.split("").every((e) => e === b[0]) ? b[0] : b;
			if (n && !H(a)) {
				let e = H(i).findIndex((e, t) => H(i)[(H(o) + t + 1) % H(i).length].name.toLowerCase().startsWith(r));
				e >= 0 && (L(o, (H(o) + e + 1) % H(i).length), A(H(o)).focus());
			} else [...u.slice(d + 1), ...u.slice(0, d + 1)].find((e) => e.getAttribute("aria-label")?.toLowerCase().startsWith(r))?.focus();
		}
	}
	function M(e) {
		H(a) && s?.contains(e.target) && e.stopPropagation();
	}
	var ee = Ho();
	U("pointerdown", an, (e) => {
		H(a) && !s.contains(e.target) && T();
	}), U("resize", an, () => T()), U("keyup", an, M, !0);
	var te = R(ee);
	Y(te, 17, () => H(i), qr, (e, t, n) => {
		var r = Lo(), i = R(r, !0);
		P(r), V(() => {
			Z(r, "data-menu", H(t).name), Z(r, "tabindex", H(o) === n ? 0 : -1), Z(r, "aria-expanded", H(a) === H(t).name), Z(r, "aria-controls", H(a) === H(t).name ? "pc-workspace-menu" : void 0), q(i, H(t).name);
		}), U("focus", r, () => L(o, n, !0)), W("click", r, (e) => D(H(t).name, e.currentTarget, "first", !0)), U("pointerenter", r, (e) => {
			H(a) && H(a) !== H(t).name && D(H(t).name, e.currentTarget);
		}), K(e, r);
	});
	var ne = B(te, 2), re = (e) => {
		var t = Vo(), n = z(t);
		let o;
		Y(n, 21, () => H(i).find((e) => e.name === H(a))?.groups ?? [], qr, (e, t, n) => {
			var i = zo(), a = z(i), o = (e) => {
				K(e, Ro());
			};
			J(a, (e) => {
				n && e(o);
			});
			var s = B(a, 2);
			r(s, () => H(t), () => !1), K(e, i);
		}), P(n), Ni(n, (e) => L(c, e), () => H(c));
		var s = B(n, 2), u = (e) => {
			var t = Bo();
			let n;
			var i = R(t);
			r(i, () => H(p).children, () => !0), P(t), Ni(t, (e) => L(l, e), () => H(l)), V(() => {
				Z(t, "aria-label", `${H(p).label} options`), n = hi(t, "", n, {
					left: `${H(g)}px`,
					top: `${H(_)}px`
				});
			}), K(e, t);
		};
		J(s, (e) => {
			H(p)?.children && e(u);
		}), V(() => {
			Z(n, "aria-label", H(a)), o = hi(n, "", o, {
				left: `${H(m)}px`,
				top: `${H(h)}px`
			});
		}), K(e, t);
	};
	J(ne, (e) => {
		H(a) && e(re);
	}), P(ee), Ni(ee, (e) => s = e, () => s), W("keydown", ee, j), W("keyup", ee, M), U("paste", ee, M), W("pointerdown", ee, M), K(e, ee), We();
}
Er([
	"click",
	"keydown",
	"keyup",
	"pointerdown"
]);
//#endregion
//#region ui/Toolbar.svelte
var Wo = /* @__PURE__ */ G("<button type=\"button\" class=\"pc-btn menu_button pc-root-stop\" title=\"Stop the workflow\">■ Stop</button>"), Go = /* @__PURE__ */ G("<header class=\"pc-header\" data-pc-ui=\"svelte\"><div class=\"pc-menubar\"><div class=\"pc-brand\"><img width=\"30\" height=\"30\" alt=\"\"/><span>LATTICE</span></div> <!> <button type=\"button\" class=\"pc-btn menu_button pc-close\" title=\"Close\" aria-label=\"Close canvas\">×</button></div> <div class=\"pc-workflow-bar\"><div class=\"pc-document-heading\"><strong class=\"pc-document-name\"> </strong><span class=\"pc-document-status\" role=\"status\" aria-label=\"Document status\"> <!><!></span></div> <div class=\"pc-header-actions pc-history\"><button type=\"button\" aria-label=\"Undo\">↶</button> <button type=\"button\" aria-label=\"Redo\">↷</button> <span> </span></div> <!> <span class=\"pc-root-workflow-status\" role=\"status\" aria-label=\"Workflow status\"> </span> <div class=\"pc-header-actions pc-surface-actions\"><button type=\"button\" title=\"Show or hide the inspector\" aria-label=\"Toggle inspector\">Details</button></div> <label class=\"pc-enable\"><input class=\"pc-enable-input\" type=\"checkbox\"/><span>Enable Lattice</span></label></div></header>");
function Ko(e, t) {
	Ue(t, !0);
	let n = /* @__PURE__ */ F(() => t.state.rootWorkflow ?? t.state.workflow), r = /* @__PURE__ */ F(() => t.state.document?.dirty ? "Modified" : t.state.document?.busy || t.state.document?.status ? "" : t.state.document ? "Saved" : "Unsaved"), i, a, o;
	function s() {
		return {
			header: i,
			enabledControl: a,
			inspBtn: o
		};
	}
	var c = { getParts: s }, l = Go(), u = R(l), d = R(u), f = R(d);
	Me(), P(d);
	var p = B(d, 2);
	Uo(p, {
		get state() {
			return t.state;
		},
		get actions() {
			return t.actions;
		},
		get local() {
			return t.local;
		},
		get panels() {
			return t.panels;
		}
	});
	var m = B(p, 2);
	P(u);
	var h = B(u, 2), g = R(h), _ = R(g), v = R(_, !0);
	P(_);
	var y = B(_), b = R(y, !0), x = B(b), S = (e) => {
		var t = Ir();
		V(() => q(t, `${H(r) ? " · " : ""}Working…`)), K(e, t);
	};
	J(x, (e) => {
		t.state.document?.busy && e(S);
	});
	var C = B(x), w = (e) => {
		var n = Ir();
		V(() => q(n, `${H(r) || t.state.document.busy ? " · " : ""}${t.state.document.status ?? ""}`)), K(e, n);
	};
	J(C, (e) => {
		t.state.document?.status && t.state.document.status !== H(r) && e(w);
	}), P(y), P(g);
	var T = B(g, 2), E = R(T), D = B(E, 2), O = B(D, 2), k = R(O, !0);
	P(O), P(T);
	var A = B(T, 2), j = (e) => {
		var n = Wo();
		W("click", n, () => t.actions.command("stop-workflow")), K(e, n);
	};
	J(A, (e) => {
		(H(n)?.ownedBusy || H(n)?.busy) && e(j);
	});
	var M = B(A, 2), ee = R(M, !0);
	P(M);
	var te = B(M, 2), ne = R(te);
	Ni(ne, (e) => o = e, () => o), P(te);
	var re = B(te, 2), ie = R(re);
	return X(ie), Ni(ie, (e) => a = e, () => a), Me(), P(re), P(h), P(l), Ni(l, (e) => i = e, () => i), V(() => {
		Z(f, "src", t.actions.logoUrl), Z(_, "title", t.state.document?.name ?? "Untitled"), q(v, t.state.document?.name ?? "Untitled"), q(b, H(r)), pi(E, 1, `pc-btn menu_button pc-undo${t.state.history.undo ? "" : " pc-disabled"}`), E.disabled = !t.state.history.undo, Z(E, "title", t.state.history.undoTitle), pi(D, 1, `pc-btn menu_button pc-redo${t.state.history.redo ? "" : " pc-disabled"}`), D.disabled = !t.state.history.redo, Z(D, "title", t.state.history.redoTitle), pi(O, 1, `pc-history-note${t.state.history.showNote ? " pc-show" : ""}`), q(k, t.state.history.note), q(ee, H(n) ? `${H(n).phase} · ≤ ${H(n).callBound} requests${H(n).status ? " · " + H(n).status : ""}` : "Workflow unavailable"), pi(ne, 1, `pc-btn menu_button pc-pane-toggle${t.state.inspectorOpen ? " pc-on" : ""}`), Z(ne, "aria-pressed", t.state.inspectorOpen), Ti(ie, t.state.enabled);
	}), W("click", m, () => t.actions.command("close")), W("click", E, () => t.actions.command("undo")), W("click", D, () => t.actions.command("redo")), W("click", ne, () => t.actions.command("inspector")), W("change", ie, (e) => t.actions.setEnabled(e.currentTarget.checked)), K(e, l), We(c);
}
Er(["click", "change"]);
//#endregion
//#region ui/PaneDivider.svelte
var qo = /* @__PURE__ */ G("<div class=\"pc-pane-divider\" role=\"separator\" aria-label=\"Resize preview\" aria-orientation=\"horizontal\" tabindex=\"0\"></div>");
function Jo(e, t) {
	Ue(t, !0);
	let n = Pi(t, "min", 3, 90), r = Pi(t, "max", 3, 500), i, a = null, o = (e) => Math.max(n(), Math.min(r(), e));
	function s(e) {
		e.button === 0 && (u(), e.preventDefault(), t.start(), a = {
			id: e.pointerId,
			y: e.clientY,
			height: t.height
		}, i.setPointerCapture(e.pointerId), i.focus({ preventScroll: !0 }));
	}
	function c(e) {
		a?.id === e.pointerId && t.change(o(a.height + e.clientY - a.y));
	}
	function l(e = !1, n = a?.id) {
		if (!a || a.id !== n) return;
		let r = a;
		a = null, e && t.change(r.height), i.hasPointerCapture(r.id) && i.releasePointerCapture(r.id);
	}
	function u() {
		l(!0);
	}
	function d(e) {
		let i = e.shiftKey ? 40 : 12, s = e.key === "ArrowUp" ? t.height - i : e.key === "ArrowDown" ? t.height + i : e.key === "Home" ? n() : e.key === "End" ? r() : null;
		s !== null && (e.preventDefault(), e.stopPropagation(), t.start(), t.change(o(s))), e.key === "Escape" && a && (e.preventDefault(), e.stopPropagation(), u());
	}
	Ii(u);
	var f = qo();
	U("blur", an, u), Ni(f, (e) => i = e, () => i), V((e, t) => {
		Z(f, "aria-valuemin", n()), Z(f, "aria-valuemax", e), Z(f, "aria-valuenow", t);
	}, [() => Math.round(r()), () => Math.round(t.height)]), W("pointerdown", f, s), W("pointermove", f, c), W("pointerup", f, (e) => l(!1, e.pointerId)), U("pointercancel", f, (e) => l(!0, e.pointerId)), U("lostpointercapture", f, (e) => l(!0, e.pointerId)), W("keydown", f, d), K(e, f), We();
}
Er([
	"pointerdown",
	"pointermove",
	"pointerup",
	"keydown"
]);
//#endregion
//#region ui/DetailsDivider.svelte
var Yo = /* @__PURE__ */ G("<div class=\"pc-details-divider svelte-1iyzcro\" role=\"separator\" aria-label=\"Resize Details\" aria-orientation=\"vertical\" tabindex=\"0\"></div>");
function Xo(e, t) {
	Ue(t, !0);
	let n = Pi(t, "min", 3, 220), r = Pi(t, "max", 3, 520), i, a = null, o = (e) => Math.max(n(), Math.min(r(), e));
	function s(e = !1, n = a?.id) {
		if (!a || a.id !== n) return;
		let r = a;
		a = null, t.preview(null), i.hasPointerCapture(r.id) && i.releasePointerCapture(r.id), e || t.change(o(r.current));
	}
	function c() {
		s(!0);
	}
	function l(e) {
		e.button === 0 && e.isPrimary !== !1 && (c(), e.preventDefault(), e.stopPropagation(), t.start(), a = {
			id: e.pointerId,
			x: e.clientX,
			width: t.width,
			current: t.width
		}, i.setPointerCapture(e.pointerId), i.focus({ preventScroll: !0 }));
	}
	function u(e) {
		a?.id === e.pointerId && (a.current = o(a.width + a.x - e.clientX), t.preview(a.current));
	}
	function d(e) {
		if (e.key === "Escape" && a) {
			e.preventDefault(), e.stopPropagation(), c();
			return;
		}
		let i = e.shiftKey ? 40 : 12, s = e.key === "ArrowLeft" ? t.width + i : e.key === "ArrowRight" ? t.width - i : e.key === "Home" ? n() : e.key === "End" ? r() : null;
		s !== null && (e.preventDefault(), e.stopPropagation(), c(), t.start(), t.change(o(s)));
	}
	Ii(c);
	var f = Yo();
	U("blur", an, c), Ni(f, (e) => i = e, () => i), V((e, t) => {
		Z(f, "aria-valuemin", n()), Z(f, "aria-valuemax", e), Z(f, "aria-valuenow", t);
	}, [() => Math.round(r()), () => Math.round(t.width)]), W("pointerdown", f, l), W("pointermove", f, u), W("pointerup", f, (e) => s(!1, e.pointerId)), U("pointercancel", f, (e) => s(!0, e.pointerId)), U("lostpointercapture", f, (e) => s(!0, e.pointerId)), W("keydown", f, d), K(e, f), We();
}
Er([
	"pointerdown",
	"pointermove",
	"pointerup",
	"keydown"
]);
//#endregion
//#region ui/GraphTabs.svelte
var Zo = /* @__PURE__ */ G("<span class=\"pc-graph-tab-lock svelte-7ptwed\" aria-label=\"Read only\">◇</span>"), Qo = /* @__PURE__ */ G("<input type=\"text\" title=\"Enter to save, Escape to cancel\"/>"), $o = /* @__PURE__ */ G("<button type=\"button\" class=\"pc-graph-tab-close svelte-7ptwed\">×</button>"), es = /* @__PURE__ */ G("<div><button type=\"button\" role=\"tab\" aria-haspopup=\"menu\"><span class=\"svelte-7ptwed\"> </span><!></button> <!> <!></div>"), ts = /* @__PURE__ */ G("<button type=\"button\" role=\"menuitem\" class=\"svelte-7ptwed\"> </button>"), ns = /* @__PURE__ */ G("<button type=\"button\" role=\"menuitem\" class=\"svelte-7ptwed\"> </button> <button type=\"button\" role=\"menuitem\" class=\"svelte-7ptwed\"> </button> <button type=\"button\" role=\"menuitem\" class=\"svelte-7ptwed\">Close tab</button> <button type=\"button\" role=\"menuitem\" class=\"svelte-7ptwed\">Close other tabs</button> <!>", 1), rs = /* @__PURE__ */ G("<!> <button type=\"button\" role=\"menuitem\" class=\"svelte-7ptwed\">Close active view</button> <button type=\"button\" role=\"menuitem\" class=\"svelte-7ptwed\">Close other views</button> <!>", 1), is = /* @__PURE__ */ G("<div role=\"menu\" tabindex=\"-1\"><!></div>"), as = /* @__PURE__ */ G("<nav aria-label=\"Open graph views\"><div class=\"pc-graph-tab-list svelte-7ptwed\" role=\"tablist\" aria-label=\"Graph views\"></div> <button type=\"button\" class=\"pc-graph-view-overflow svelte-7ptwed\" aria-label=\"Graph view actions\" title=\"Focus, close or reopen graph views\" aria-haspopup=\"menu\">⋯</button> <!></nav>");
function os(e, t) {
	Ue(t, !0);
	let n = Pi(t, "actions", 19, () => ({})), r = Pi(t, "idPrefix", 3, "pc-graph-view"), i = /* @__PURE__ */ I(null), a = /* @__PURE__ */ I(null), o = /* @__PURE__ */ I(null), s = /* @__PURE__ */ I(!1), c = /* @__PURE__ */ I(""), l = /* @__PURE__ */ I(""), u = /* @__PURE__ */ I(0), d = /* @__PURE__ */ I(0), f = "", p = /* @__PURE__ */ I(""), m = /* @__PURE__ */ I(""), h = /* @__PURE__ */ I(null), g = "", _ = null, v = 0, y = /* @__PURE__ */ F(() => t.views?.tabs.find((e) => e.key === H(l))), b = {};
	Cn(() => {
		let e = t.views?.active.key ?? "";
		f === e ? t.views && !t.views.tabs.some((e) => e.key === H(c)) && L(c, e, !0) : (L(c, e, !0), O(), L(p, "")), H(l) && !H(y) && O(), H(p) && (t.views?.workflowId !== g || !t.views.tabs.some((e) => e.key === H(p))) && L(p, ""), f = e;
	});
	async function x(e) {
		let r = t.views?.tabs.find((t) => t.key === e);
		if (!r || r.identity.kind === "library" || !n().renameView || n().canRenameView?.(e) === !1) return;
		let i = ++v;
		_ = null, O(), g = t.views.workflowId, L(m, r.label, !0), L(p, e, !0), await mr(), H(p) === e && v === i && (_ = H(h), H(h)?.focus({ preventScroll: !0 }), H(h)?.select());
	}
	async function S(e, r, i = !0) {
		let a = H(p), o = t.views?.tabs.find((e) => e.key === a), s = H(m).trim();
		a && e === _ && (L(p, ""), _ = null, r && o && s && s !== o.label && t.views?.workflowId === g && o.identity.kind !== "library" && n().canRenameView?.(a) !== !1 && n().renameView?.(a, s), i && (await mr(), b[a]?.focus({ preventScroll: !0 })));
	}
	function C(e) {
		e.stopPropagation(), !e.isComposing && (e.key === "Enter" || e.key === "Escape") && (e.preventDefault(), S(e.currentTarget, e.key === "Enter"));
	}
	function w(e) {
		let t = e.breadcrumbs.map((e) => e.label).join(" / ") || e.label, n = e.identity;
		return n.kind === "instance" ? `${t} (${n.instancePath.map((e) => JSON.stringify(e)).join(" → ")})` : n.kind === "library" ? `${t} · Library v${n.definitionRef.version} (${n.definitionRef.id})` : t;
	}
	function T(e) {
		L(c, e, !0), n().focusView?.(e), b[e]?.focus({ preventScroll: !0 });
	}
	function E(e, n) {
		if (t.views && (e.key === "ContextMenu" || e.key === "F10" && e.shiftKey)) {
			e.preventDefault(), e.stopPropagation();
			let r = t.views.tabs[n], i = b[r.key]?.getBoundingClientRect();
			A(r, i?.left ?? 8, i?.bottom ?? 8);
			return;
		}
		if (!t.views || ![
			"ArrowLeft",
			"ArrowRight",
			"Home",
			"End",
			"Delete"
		].includes(e.key)) return;
		if (e.preventDefault(), e.stopPropagation(), e.key === "Delete") {
			t.views.tabs[n].identity.kind !== "root" && D(t.views.tabs[n]);
			return;
		}
		let r = e.key === "Home" ? 0 : e.key === "End" ? t.views.tabs.length - 1 : (n + (e.key === "ArrowLeft" ? t.views.tabs.length - 1 : 1)) % t.views.tabs.length;
		T(t.views.tabs[r].key);
	}
	async function D(e) {
		if (e.identity.kind === "root") return;
		n().closeView?.(e.key), await mr();
		let r = t.views?.active.key;
		r && t.views?.tabs.some((e) => e.key === r) && (L(c, r, !0), b[r]?.focus({ preventScroll: !0 }));
	}
	function O(e = !1) {
		let t = H(l) ? b[H(l)] : H(o);
		L(s, !1), L(l, ""), e && t?.focus({ preventScroll: !0 });
	}
	function k(e, t) {
		e.preventDefault(), e.stopPropagation(), A(t, e.clientX, e.clientY);
	}
	async function A(e, t, n) {
		if (L(l, e.key, !0), L(u, t, !0), L(d, n, !0), L(s, !0), await mr(), !H(s) || H(l) !== e.key) return;
		let r = H(a)?.getBoundingClientRect();
		L(u, Math.min(Math.max(8, t), Math.max(8, window.innerWidth - (r?.width ?? 0) - 8)), !0), L(d, Math.min(Math.max(8, n), Math.max(8, window.innerHeight - (r?.height ?? 0) - 8)), !0), H(a)?.querySelector("button:not(:disabled)")?.focus({ preventScroll: !0 });
	}
	async function j() {
		let e = !!H(l);
		L(l, ""), L(s, e || !H(s), !0), H(s) && (await mr(), H(s) && H(a)?.querySelector("button:not(:disabled)")?.focus());
	}
	function M(e) {
		if (e.stopPropagation(), e.key === "Escape") {
			e.preventDefault(), O(!0);
			return;
		}
		if (e.key === "Tab") {
			O();
			return;
		}
		if (![
			"ArrowDown",
			"ArrowUp",
			"Home",
			"End"
		].includes(e.key)) return;
		e.preventDefault();
		let t = [...H(a).querySelectorAll("button:not(:disabled)")], n = t.indexOf(e.target);
		t[e.key === "Home" ? 0 : e.key === "End" ? t.length - 1 : (n + (e.key === "ArrowUp" ? t.length - 1 : 1)) % t.length]?.focus();
	}
	function ee(e) {
		O(!0), e();
	}
	function te(e) {
		let t = H(y);
		t && (O(!0), e(t));
	}
	var ne = { startRename: x }, re = Lr();
	U("pointerdown", an, (e) => {
		H(s) && !H(a)?.contains(e.target) && e.target !== H(o) && O();
	}), U("resize", an, () => O());
	var ie = z(re), ae = (e) => {
		var f = as();
		let g;
		var _ = R(f);
		Y(_, 23, () => t.views.tabs, (e) => e.key, (e, n, i) => {
			var a = es();
			let o;
			var u = R(a);
			let d;
			var f = R(u), g = R(f, !0);
			P(f);
			var _ = B(f), v = (e) => {
				K(e, Zo());
			};
			J(_, (e) => {
				H(n).readOnly && e(v);
			}), P(u), Ni(u, (e, t) => b[t.key] = e, (e) => b?.[e.key], () => [H(n)]);
			var y = B(u, 2), x = (e) => {
				var t = Qo();
				X(t);
				let r;
				Ni(t, (e) => L(h, e), () => H(h)), V(() => {
					r = pi(t, 1, "pc-graph-tab-rename svelte-7ptwed", null, r, { "pc-graph-tab-closeable": H(n).identity.kind !== "root" }), Z(t, "aria-label", H(n).identity.kind === "root" ? "Graph name" : "Subgraph name"), Z(t, "maxlength", H(n).identity.kind === "instance" ? 80 : void 0);
				}), W("keydown", t, C), U("blur", t, (e) => S(e.currentTarget, !0, !1)), ki(t, () => H(m), (e) => L(m, e)), K(e, t);
			};
			J(y, (e) => {
				H(p) === H(n).key && e(x);
			});
			var O = B(y, 2), A = (e) => {
				var r = $o();
				V((e, i) => {
					Z(r, "aria-label", e), Z(r, "title", i), Z(r, "tabindex", H(n).key === (H(c) || t.views.active.key) ? 0 : -1);
				}, [() => `Close ${H(n).label} · ${w(H(n))}`, () => `Close ${w(H(n))}`]), W("click", r, () => D(H(n))), W("contextmenu", r, (e) => k(e, H(n))), W("keydown", r, (e) => E(e, H(i))), K(e, r);
			};
			J(O, (e) => {
				H(n).identity.kind !== "root" && e(A);
			}), P(a), V((e) => {
				o = pi(a, 1, "pc-graph-tab-item svelte-7ptwed", null, o, {
					"pc-graph-tab-active": H(n).key === t.views.active.key,
					"pc-graph-tab-editing": H(p) === H(n).key
				}), d = pi(u, 1, "pc-graph-tab svelte-7ptwed", null, d, { "pc-graph-tab-closeable": H(n).identity.kind !== "root" }), Z(u, "id", `${r()}-${H(i)}`), Z(u, "aria-controls", t.panelId), Z(u, "aria-selected", H(n).key === t.views.active.key), Z(u, "aria-expanded", H(s) && H(l) === H(n).key), Z(u, "tabindex", H(p) !== H(n).key && H(n).key === (H(c) || t.views.active.key) ? 0 : -1), Z(u, "title", e), q(g, H(n).label);
			}, [() => w(H(n))]), W("click", u, () => T(H(n).key)), W("pointerdown", u, (e) => {
				e.button === 2 && e.preventDefault();
			}), W("contextmenu", u, (e) => k(e, H(n))), W("keydown", u, (e) => E(e, H(i))), K(e, a);
		}), P(_);
		var v = B(_, 2);
		Ni(v, (e) => L(o, e), () => H(o));
		var O = B(v, 2), A = (e) => {
			var r = is();
			let i;
			var o = R(r), s = (e) => {
				let r = /* @__PURE__ */ F(() => H(y)), i = /* @__PURE__ */ F(() => n().canRenameView?.(H(r).key) === !1);
				var a = ns(), o = z(a), s = R(o, !0);
				P(o);
				var c = B(o, 2), l = R(c, !0);
				P(c);
				var u = B(c, 2), d = B(u, 2);
				Y(B(d, 2), 17, () => t.views.closedViews, (e) => e.key, (e, t) => {
					var r = ts(), i = R(r);
					P(r), V((e, a) => {
						r.disabled = !n().reopenView, Z(r, "title", e), q(i, `Reopen ${H(t).label ?? ""} · ${a ?? ""}`);
					}, [() => w(H(t)), () => w(H(t))]), W("click", r, () => ee(() => n().reopenView?.(H(t).key))), K(e, r);
				}), V((e) => {
					o.disabled = !n().exportView, q(s, H(r).identity.kind === "root" ? "Export workflow JSON" : "Export subgraph JSON"), c.disabled = H(r).identity.kind === "library" || H(i) || !n().renameView, Z(c, "title", H(r).identity.kind === "library" ? "Library inspection is read only." : H(i) ? "Make a local copy of the containing graph to rename this subgraph." : void 0), q(l, H(r).identity.kind === "root" ? "Rename graph" : "Rename subgraph"), u.disabled = H(r).identity.kind === "root" || !n().closeView, d.disabled = e;
				}, [() => t.views.tabs.every((e) => e.identity.kind === "root" || e.key === H(r).key) || !n().closeOtherViews]), W("click", o, () => te((e) => n().exportView?.(e.key))), W("click", c, () => te((e) => x(e.key))), W("click", u, () => te((e) => D(e))), W("click", d, () => te((e) => n().closeOtherViews?.(e.key))), K(e, a);
			}, c = (e) => {
				var r = rs(), i = z(r);
				Y(i, 17, () => t.views.tabs, (e) => e.key, (e, t) => {
					var n = ts(), r = R(n);
					P(n), V((e, t) => {
						Z(n, "title", e), q(r, `Focus ${t ?? ""}`);
					}, [() => w(H(t)), () => w(H(t))]), W("click", n, () => ee(() => T(H(t).key))), K(e, n);
				});
				var a = B(i, 2), o = B(a, 2);
				Y(B(o, 2), 17, () => t.views.closedViews, (e) => e.key, (e, t) => {
					var r = ts(), i = R(r);
					P(r), V((e, n) => {
						Z(r, "title", e), q(i, `Reopen ${H(t).label ?? ""} · ${n ?? ""}`);
					}, [() => w(H(t)), () => w(H(t))]), W("click", r, () => ee(() => n().reopenView?.(H(t).key))), K(e, r);
				}), V((e) => {
					a.disabled = t.views.active.identity.kind === "root" || !n().closeView, o.disabled = e;
				}, [() => t.views.tabs.every((e) => e.identity.kind === "root" || e.key === t.views.active.key) || !n().closeOtherViews]), W("click", a, () => ee(() => D(t.views.active))), W("click", o, () => ee(() => n().closeOtherViews?.(t.views.active.key))), K(e, r);
			};
			J(o, (e) => {
				H(y) ? e(s) : e(c, -1);
			}), P(r), Ni(r, (e) => L(a, e), () => H(a)), V(() => {
				i = pi(r, 1, "pc-graph-view-menu svelte-7ptwed", null, i, { "pc-graph-tab-menu": !!H(l) }), hi(r, H(l) ? `left: ${H(u)}px; top: ${H(d)}px;` : void 0), Z(r, "aria-label", H(y) ? `Actions for ${H(y).label}` : "Graph view actions");
			}), W("keydown", r, M), K(e, r);
		};
		J(O, (e) => {
			H(s) && e(A);
		}), P(f), Ni(f, (e) => L(i, e), () => H(i)), V(() => {
			g = pi(f, 1, "pc-graph-tabs pc-graph-tabs-multi svelte-7ptwed", null, g, { "pc-graph-tabs-menu-open": H(s) }), Z(v, "aria-expanded", H(s) && !H(l));
		}), W("click", v, j), K(e, f);
	};
	return J(ie, (e) => {
		t.views && e(ae);
	}), K(e, re), We(ne);
}
Er([
	"click",
	"pointerdown",
	"contextmenu",
	"keydown"
]);
//#endregion
//#region ui/GraphBreadcrumbs.svelte
var ss = /* @__PURE__ */ G("<span aria-current=\"page\" class=\"svelte-18ovafz\"> </span>"), cs = /* @__PURE__ */ G("<button type=\"button\" class=\"svelte-18ovafz\"> </button>"), ls = /* @__PURE__ */ G("<li class=\"svelte-18ovafz\"><!></li>"), us = /* @__PURE__ */ G("<div class=\"pc-graph-location svelte-18ovafz\"><nav aria-label=\"Graph location\" class=\"svelte-18ovafz\"><ol class=\"svelte-18ovafz\"></ol></nav> <span class=\"pc-graph-scope svelte-18ovafz\"> <!><!></span></div>");
function ds(e, t) {
	Ue(t, !0);
	let n = Pi(t, "actions", 19, () => ({})), r = /* @__PURE__ */ F(() => t.view?.identity.kind === "library" ? t.view.identity.definitionRef : t.definitionRef ?? t.view?.definitionRef);
	function i(e) {
		return e.identity.kind === "instance" ? !!n().openInstance : !!n().focusView;
	}
	function a(e) {
		e.identity.kind === "instance" ? n().openInstance?.(e.identity.instancePath) : n().focusView?.(e.key);
	}
	var o = Lr(), s = z(o), c = (e) => {
		var n = us(), o = R(n), s = R(o);
		Y(s, 23, () => t.view.breadcrumbs, (e) => e.key, (e, n, r) => {
			var o = ls(), s = R(o), c = (e) => {
				var t = ss(), r = R(t, !0);
				P(t), V(() => q(r, H(n).label)), K(e, t);
			}, l = (e) => {
				var t = cs(), r = R(t, !0);
				P(t), V((e) => {
					t.disabled = e, q(r, H(n).label);
				}, [() => !i(H(n))]), W("click", t, () => a(H(n))), K(e, t);
			};
			J(s, (e) => {
				H(r) === t.view.breadcrumbs.length - 1 ? e(c) : e(l, -1);
			}), P(o), K(e, o);
		}), P(s), P(o);
		var c = B(o, 2), l = R(c, !0), u = B(l), d = (e) => {
			var t = Ir();
			V(() => q(t, `· v${H(r).version ?? ""}`)), K(e, t);
		};
		J(u, (e) => {
			H(r) && e(d);
		});
		var f = B(u), p = (e) => {
			K(e, Ir("· Read only"));
		};
		J(f, (e) => {
			(t.view.readOnly || t.view.identity.kind === "library") && e(p);
		}), P(c), P(n), V(() => {
			Z(c, "title", H(r) ? `${H(r).id} · v${H(r).version} · ${H(r).semanticHash}` : void 0), q(l, t.view.identity.kind === "library" ? "Library inspection" : "Instance graph");
		}), K(e, n);
	};
	J(s, (e) => {
		t.view && t.view.identity.kind !== "root" && e(c);
	}), K(e, o), We();
}
Er(["click"]);
//#endregion
//#region ui/StructuredControl.svelte
var fs = /* @__PURE__ */ G("<small class=\"svelte-taw2zx\">Rows are available when this JSON has a supported shape.</small>"), ps = /* @__PURE__ */ G("<label class=\"svelte-taw2zx\"> </label><textarea class=\"pc-structured-raw svelte-taw2zx\" spellcheck=\"false\"></textarea> <!>", 1), ms = /* @__PURE__ */ G("<option class=\"svelte-taw2zx\"> </option>"), hs = /* @__PURE__ */ G("<label class=\"svelte-taw2zx\">Phase</label><select class=\"svelte-taw2zx\"></select> <label class=\"svelte-taw2zx\">Steps</label><input type=\"number\" min=\"1\" max=\"64\" step=\"1\" class=\"svelte-taw2zx\"/>", 1), gs = /* @__PURE__ */ G("<label class=\"svelte-taw2zx\">Name</label><input maxlength=\"128\" class=\"svelte-taw2zx\"/> <label class=\"svelte-taw2zx\">Value</label><input type=\"number\" step=\"any\" class=\"svelte-taw2zx\"/>", 1), _s = /* @__PURE__ */ G("<label class=\"svelte-taw2zx\">Default (JSON)</label><textarea class=\"svelte-taw2zx\"></textarea>", 1), vs = /* @__PURE__ */ G("<label class=\"svelte-taw2zx\">Name</label><input class=\"svelte-taw2zx\"/> <label class=\"svelte-taw2zx\">Path (JSON array)</label><input class=\"svelte-taw2zx\"/> <label class=\"pc-structured-check svelte-taw2zx\"><input type=\"checkbox\" class=\"svelte-taw2zx\"/> Required</label> <label class=\"pc-structured-check svelte-taw2zx\"><input type=\"checkbox\" class=\"svelte-taw2zx\"/> Use default when missing</label><small class=\"svelte-taw2zx\">Defaults apply when Required is off.</small> <!>", 1), ys = /* @__PURE__ */ G("<label class=\"svelte-taw2zx\">ID</label><input maxlength=\"128\" class=\"svelte-taw2zx\"/> <label class=\"svelte-taw2zx\">Label</label><input maxlength=\"80\" class=\"svelte-taw2zx\"/>", 1), bs = /* @__PURE__ */ G("<label class=\"svelte-taw2zx\">Name</label><input class=\"svelte-taw2zx\"/> <label class=\"svelte-taw2zx\">Text</label><textarea class=\"svelte-taw2zx\"></textarea> <label class=\"svelte-taw2zx\">Kind</label><select class=\"svelte-taw2zx\"><option class=\"svelte-taw2zx\">Text</option><option class=\"svelte-taw2zx\">Guidance</option></select> <label class=\"pc-structured-check svelte-taw2zx\"><input type=\"checkbox\" class=\"svelte-taw2zx\"/> Required input</label> <label class=\"svelte-taw2zx\">Skipped source</label><select class=\"svelte-taw2zx\"><option class=\"svelte-taw2zx\">Use fallback text</option><option class=\"svelte-taw2zx\">Omit section</option></select>", 1), xs = /* @__PURE__ */ G("<label class=\"svelte-taw2zx\">Kind</label><select class=\"svelte-taw2zx\"><option class=\"svelte-taw2zx\">Literal</option><option class=\"svelte-taw2zx\">Regular expression</option></select> <label class=\"svelte-taw2zx\">Pattern</label><input class=\"svelte-taw2zx\"/> <label class=\"svelte-taw2zx\">Replacement</label><textarea class=\"svelte-taw2zx\"></textarea> <label class=\"svelte-taw2zx\">Flags</label><input class=\"svelte-taw2zx\"/>", 1), Ss = /* @__PURE__ */ G("<button type=\"button\" class=\"svelte-taw2zx\">Move up</button><button type=\"button\" class=\"svelte-taw2zx\">Move down</button>", 1), Cs = /* @__PURE__ */ G("<fieldset class=\"pc-structured-row svelte-taw2zx\"><legend class=\"svelte-taw2zx\"> </legend> <!> <div class=\"pc-structured-actions svelte-taw2zx\"><!><button type=\"button\" class=\"svelte-taw2zx\">Remove</button></div></fieldset>"), ws = /* @__PURE__ */ G("<div class=\"pc-structured-rows svelte-taw2zx\"></div> <button type=\"button\" class=\"svelte-taw2zx\"> </button>", 1), Ts = /* @__PURE__ */ G("<div class=\"pc-structured-control svelte-taw2zx\"><div class=\"pc-structured-mode svelte-taw2zx\"><button type=\"button\" class=\"svelte-taw2zx\"> </button></div> <!></div>");
function Es(e, t) {
	Ue(t, !0);
	let n = Pi(t, "disabled", 3, !1), r = Pi(t, "error", 3, ""), i = [
		"onset",
		"peak",
		"plateau",
		"decline",
		"aftermath"
	];
	function a(e) {
		return !Object.hasOwn(e, "flags") || typeof e.flags == "string" && [...e.flags].every((t) => (e.kind === "regex" ? "imsu" : "iu").includes(t)) && new Set(e.flags).size === e.flags.length;
	}
	function o(e) {
		return typeof e == "number" ? Number.isFinite(e) : Array.isArray(e) ? e.every(o) : typeof e != "object" || !e || Object.values(e).every(o);
	}
	function s(e) {
		return typeof e == "object" && !!e && !Array.isArray(e);
	}
	let c = /* @__PURE__ */ F(() => t.control.structured === "fields" ? "field" : t.control.structured === "sections" ? "section" : t.control.structured === "slots" ? "slot" : t.control.structured === "numeric-map" ? "value" : t.control.structured === "durations" ? "duration" : "rule"), l = /* @__PURE__ */ F(() => t.control.structured === "fields" ? 128 : t.control.structured === "slots" ? 16 : t.control.structured === "numeric-map" ? 32 : t.control.structured === "durations" ? 5 : 64), u = /* @__PURE__ */ F(() => t.control.structured === "slots" ? 2 : 0);
	function d() {
		try {
			let e = t.draftValue === void 0 ? JSON.parse(t.text) : t.draftValue;
			return o(e) ? t.control.structured === "durations" ? s(e) && Object.entries(e).every(([e, t]) => i.includes(e) && Number.isSafeInteger(t) && Number(t) >= 1 && Number(t) <= 64) ? Object.entries(e).map(([e, t]) => ({
				name: e,
				number: t
			})) : null : t.control.structured === "numeric-map" ? s(e) && Object.keys(e).length <= 32 && Object.values(e).every((e) => typeof e == "number" && Number.isFinite(e)) ? Object.entries(e).map(([e, t]) => ({
				name: e,
				number: t
			})) : null : !Array.isArray(e) || e.length > H(l) ? null : t.control.structured === "fields" ? e.every((e) => s(e) && Object.keys(e).every((e) => [
				"name",
				"path",
				"required",
				"default"
			].includes(e)) && typeof e.name == "string" && Array.isArray(e.path) && e.path.every((e) => typeof e == "string" || Number.isSafeInteger(e) && e >= 0) && (!Object.hasOwn(e, "required") || typeof e.required == "boolean")) ? e : null : t.control.structured === "sections" ? e.every((e) => s(e) && Object.keys(e).every((e) => [
				"name",
				"text",
				"kind",
				"required",
				"onSkipped"
			].includes(e)) && typeof e.name == "string" && typeof e.text == "string" && (e.kind === void 0 || ["text", "guidance"].includes(String(e.kind))) && (e.required === void 0 || typeof e.required == "boolean") && (e.onSkipped === void 0 || ["fallback", "omit"].includes(String(e.onSkipped)))) ? e : null : t.control.structured === "slots" ? e.length >= 2 && e.every((e) => s(e) && Object.keys(e).every((e) => ["id", "label"].includes(e)) && typeof e.id == "string" && typeof e.label == "string") ? e : null : t.control.structured === "rules" && e.every((e) => s(e) && Object.keys(e).every((e) => [
				"kind",
				"pattern",
				"replacement",
				"flags"
			].includes(e)) && ["literal", "regex"].includes(String(e.kind)) && typeof e.pattern == "string" && (!Object.hasOwn(e, "replacement") || typeof e.replacement == "string") && a(e)) ? e : null : null;
		} catch {
			return null;
		}
	}
	let f = /* @__PURE__ */ F(d), p = /* @__PURE__ */ I(!1), m = /* @__PURE__ */ F(() => H(p) || !H(f)), h = /* @__PURE__ */ F(() => H(m) && t.draftValue !== void 0 ? JSON.stringify(t.draftValue, null, 2) : t.text);
	function g(e) {
		n() || (L(p, !0), t.ontext(e));
	}
	function _(e) {
		n() || (t.onDraft ? t.onDraft(e) : t.ontext(JSON.stringify(e, null, 2)));
	}
	function v(e) {
		_(["numeric-map", "durations"].includes(t.control.structured ?? "") ? Object.fromEntries(e.map((e) => [String(e.name), e.number])) : e);
	}
	function y(e, t, r) {
		!n() && H(f) && v(H(f).map((n, i) => i === e ? {
			...n,
			[t]: r
		} : n));
	}
	function b() {
		if (n() || !H(f) || H(f).length >= H(l)) return;
		let e = 1;
		for (; H(f).some((t) => t.name === H(c) + e || t.id === "context-" + e);) e++;
		v([...H(f), t.control.structured === "fields" ? {
			name: H(c) + e,
			path: []
		} : t.control.structured === "sections" ? {
			name: H(c) + e,
			text: ""
		} : t.control.structured === "slots" ? {
			id: "context-" + e,
			label: "Context " + e
		} : t.control.structured === "numeric-map" ? {
			name: H(c) + e,
			number: 0
		} : t.control.structured === "durations" ? {
			name: i.find((e) => !H(f).some((t) => t.name === e)),
			number: 1
		} : {
			kind: "literal",
			pattern: "text",
			replacement: ""
		}]);
	}
	function x(e, r) {
		let i = r.valueAsNumber;
		!n() && H(f) && (!Number.isFinite(i) || t.control.structured === "durations" && (!Number.isSafeInteger(i) || i < 1 || i > 64) ? r.value = String(H(f)[e].number) : y(e, "number", i));
	}
	function S(e, t) {
		!n() && H(f) && (!t.value.trim() || t.value.length > 128 || H(f).some((n, r) => r !== e && n.name === t.value) ? t.value = String(H(f)[e].name) : y(e, "name", t.value));
	}
	function C(e, r, i) {
		if (!n() && H(f)) try {
			let t = JSON.parse(i);
			if (!o(t)) throw Error("Nonfinite JSON");
			y(e, r, t);
		} catch {
			let n = 0, a = "__structured_json_0__";
			for (; (t.draftValue === void 0 ? t.text : JSON.stringify(t.draftValue)).includes(a);) a = "__structured_json_" + ++n + "__";
			let o = H(f).map((t, n) => n === e ? {
				...t,
				[r]: a
			} : t);
			L(p, !0), t.ontext(JSON.stringify(o, null, 2).replace(JSON.stringify(a), () => i));
		}
	}
	function w(e, t) {
		!n() && H(f) && v(H(f).map((n, r) => {
			if (r !== e) return n;
			let i = { ...n };
			return t ? i.default = null : delete i.default, i;
		}));
	}
	function T(e) {
		!n() && H(f) && H(f).length > H(u) && v(H(f).filter((t, n) => n !== e));
	}
	function E(e, t) {
		if (n() || !H(f) || e + t < 0 || e + t >= H(f).length) return;
		let r = [...H(f)];
		[r[e], r[e + t]] = [r[e + t], r[e]], v(r);
	}
	var D = Ts(), O = R(D), k = R(O), A = R(k, !0);
	P(k), P(O);
	var j = B(O, 2), M = (e) => {
		var i = ps(), a = z(i), o = R(a);
		P(a);
		var s = B(a);
		at(s);
		var c = B(s, 2), l = (e) => {
			K(e, fs());
		};
		J(c, (e) => {
			H(f) || e(l);
		}), V(() => {
			Z(a, "for", t.idPrefix + "-raw"), q(o, `${t.control.label ?? ""} (JSON)`), Z(s, "id", t.idPrefix + "-raw"), Z(s, "aria-label", t.control.label), Z(s, "aria-invalid", !!r()), Z(s, "aria-describedby", r() ? t.idPrefix + "-error" : void 0), wi(s, H(h)), s.disabled = n();
		}), W("input", s, (e) => g(e.currentTarget.value)), K(e, i);
	}, ee = (e) => {
		var r = ws(), a = z(r);
		Y(a, 21, () => H(f), qr, (e, r, a) => {
			var o = Cs(), s = R(o), l = R(s);
			P(s);
			var d = B(s, 2), p = (e) => {
				var o = hs(), s = z(o), c = B(s);
				Z(c, "aria-label", "Duration " + (a + 1) + " phase"), Y(c, 21, () => i, qr, (e, t) => {
					var n = ms(), r = R(n, !0);
					P(n);
					var i = {};
					V((e, a) => {
						n.disabled = e, q(r, a), i !== (i = H(t)) && (n.value = (n.__value = H(t)) ?? "");
					}, [() => H(f).some((e, n) => n !== a && e.name === H(t)), () => H(t)[0].toUpperCase() + H(t).slice(1)]), K(e, n);
				}), P(c);
				var l;
				_i(c);
				var u = B(c, 2), d = B(u);
				X(d), Z(d, "aria-label", "Duration " + (a + 1) + " steps"), V((e, r) => {
					Z(s, "for", t.idPrefix + "-phase-" + a), Z(c, "id", t.idPrefix + "-phase-" + a), c.disabled = n(), l !== (l = e) && (c.value = (c.__value = e) ?? "", gi(c, e)), Z(u, "for", t.idPrefix + "-steps-" + a), Z(d, "id", t.idPrefix + "-steps-" + a), wi(d, r), d.disabled = n();
				}, [() => String(H(r).name), () => Number(H(r).number)]), W("change", c, (e) => S(a, e.currentTarget)), W("change", d, (e) => x(a, e.currentTarget)), K(e, o);
			}, m = (e) => {
				var i = gs(), o = z(i), s = B(o);
				X(s), Z(s, "aria-label", "Value " + (a + 1) + " name");
				var c = B(s, 2), l = B(c);
				X(l), Z(l, "aria-label", "Value " + (a + 1) + " number"), V((e, r) => {
					Z(o, "for", t.idPrefix + "-name-" + a), Z(s, "id", t.idPrefix + "-name-" + a), wi(s, e), s.disabled = n(), Z(c, "for", t.idPrefix + "-number-" + a), Z(l, "id", t.idPrefix + "-number-" + a), wi(l, r), Z(l, "min", t.control.min), Z(l, "max", t.control.max), l.disabled = n();
				}, [() => String(H(r).name), () => Number(H(r).number)]), W("change", s, (e) => S(a, e.currentTarget)), W("change", l, (e) => x(a, e.currentTarget)), K(e, i);
			}, h = (e) => {
				var i = vs(), o = z(i), s = B(o);
				X(s), Z(s, "aria-label", "Field " + (a + 1) + " name");
				var c = B(s, 2), l = B(c);
				X(l), Z(l, "aria-label", "Field " + (a + 1) + " path (JSON array)");
				var u = B(l, 2), d = R(u);
				X(d), Z(d, "aria-label", "Field " + (a + 1) + " required"), Me(), P(u);
				var f = B(u, 2), p = R(f);
				X(p), Z(p, "aria-label", "Field " + (a + 1) + " use default"), Me(), P(f);
				var m = B(f, 3), h = (e) => {
					var i = _s(), o = z(i), s = B(o);
					at(s), Z(s, "aria-label", "Field " + (a + 1) + " default (JSON)"), V((e) => {
						Z(o, "for", t.idPrefix + "-default-" + a), Z(s, "id", t.idPrefix + "-default-" + a), wi(s, e), s.disabled = n();
					}, [() => JSON.stringify(H(r).default, null, 2)]), W("change", s, (e) => C(a, "default", e.currentTarget.value)), K(e, i);
				}, g = /* @__PURE__ */ F(() => Object.hasOwn(H(r), "default"));
				J(m, (e) => {
					H(g) && e(h);
				}), V((e, i, u) => {
					Z(o, "for", t.idPrefix + "-name-" + a), Z(s, "id", t.idPrefix + "-name-" + a), wi(s, e), s.disabled = n(), Z(c, "for", t.idPrefix + "-path-" + a), Z(l, "id", t.idPrefix + "-path-" + a), wi(l, i), l.disabled = n(), Ti(d, H(r).required !== !1), d.disabled = n(), Ti(p, u), p.disabled = n();
				}, [
					() => String(H(r).name),
					() => JSON.stringify(H(r).path),
					() => Object.hasOwn(H(r), "default")
				]), W("input", s, (e) => y(a, "name", e.currentTarget.value)), W("change", l, (e) => C(a, "path", e.currentTarget.value)), W("change", d, (e) => y(a, "required", e.currentTarget.checked)), W("change", p, (e) => w(a, e.currentTarget.checked)), K(e, i);
			}, g = (e) => {
				var i = ys(), o = z(i), s = B(o);
				X(s), Z(s, "aria-label", "Slot " + (a + 1) + " ID");
				var c = B(s, 2), l = B(c);
				X(l), Z(l, "aria-label", "Slot " + (a + 1) + " label"), V((e, r) => {
					Z(o, "for", t.idPrefix + "-slot-id-" + a), Z(s, "id", t.idPrefix + "-slot-id-" + a), wi(s, e), s.disabled = n(), Z(c, "for", t.idPrefix + "-slot-label-" + a), Z(l, "id", t.idPrefix + "-slot-label-" + a), wi(l, r), l.disabled = n();
				}, [() => String(H(r).id), () => String(H(r).label)]), W("input", s, (e) => y(a, "id", e.currentTarget.value)), W("input", l, (e) => y(a, "label", e.currentTarget.value)), K(e, i);
			}, _ = (e) => {
				var i = bs(), o = z(i), s = B(o);
				X(s), Z(s, "aria-label", "Section " + (a + 1) + " name");
				var c = B(s, 2), l = B(c);
				at(l), Z(l, "aria-label", "Section " + (a + 1) + " text");
				var u = B(l, 2), d = B(u);
				Z(d, "aria-label", "Section " + (a + 1) + " kind");
				var f = R(d);
				f.value = f.__value = "text";
				var p = B(f);
				p.value = p.__value = "guidance", P(d);
				var m;
				_i(d);
				var h = B(d, 2), g = R(h);
				X(g), Z(g, "aria-label", "Section " + (a + 1) + " required"), Me(), P(h);
				var _ = B(h, 2), v = B(_);
				Z(v, "aria-label", "Section " + (a + 1) + " skipped source");
				var b = R(v);
				b.value = b.__value = "fallback";
				var x = B(b);
				x.value = x.__value = "omit", P(v);
				var S;
				_i(v), V((e, i, f, p) => {
					Z(o, "for", t.idPrefix + "-name-" + a), Z(s, "id", t.idPrefix + "-name-" + a), wi(s, e), s.disabled = n(), Z(c, "for", t.idPrefix + "-text-" + a), Z(l, "id", t.idPrefix + "-text-" + a), wi(l, i), l.disabled = n(), Z(u, "for", t.idPrefix + "-section-kind-" + a), Z(d, "id", t.idPrefix + "-section-kind-" + a), d.disabled = n(), m !== (m = f) && (d.value = (d.__value = f) ?? "", gi(d, f)), Ti(g, H(r).required === !0), g.disabled = n(), Z(_, "for", t.idPrefix + "-section-skip-" + a), Z(v, "id", t.idPrefix + "-section-skip-" + a), v.disabled = n(), S !== (S = p) && (v.value = (v.__value = p) ?? "", gi(v, p));
				}, [
					() => String(H(r).name),
					() => String(H(r).text),
					() => String(H(r).kind ?? "text"),
					() => String(H(r).onSkipped ?? "fallback")
				]), W("input", s, (e) => y(a, "name", e.currentTarget.value)), W("input", l, (e) => y(a, "text", e.currentTarget.value)), W("change", d, (e) => y(a, "kind", e.currentTarget.value)), W("change", g, (e) => y(a, "required", e.currentTarget.checked)), W("change", v, (e) => y(a, "onSkipped", e.currentTarget.value)), K(e, i);
			}, v = (e) => {
				var i = xs(), o = z(i), s = B(o);
				Z(s, "aria-label", "Rule " + (a + 1) + " kind");
				var c = R(s);
				c.value = c.__value = "literal";
				var l = B(c);
				l.value = l.__value = "regex", P(s);
				var u;
				_i(s);
				var d = B(s, 2), f = B(d);
				X(f), Z(f, "aria-label", "Rule " + (a + 1) + " pattern");
				var p = B(f, 2), m = B(p);
				at(m), Z(m, "aria-label", "Rule " + (a + 1) + " replacement");
				var h = B(m, 2), g = B(h);
				X(g), Z(g, "aria-label", "Rule " + (a + 1) + " flags"), V((e, r, i, c) => {
					Z(o, "for", t.idPrefix + "-kind-" + a), Z(s, "id", t.idPrefix + "-kind-" + a), s.disabled = n(), u !== (u = e) && (s.value = (s.__value = e) ?? "", gi(s, e)), Z(d, "for", t.idPrefix + "-pattern-" + a), Z(f, "id", t.idPrefix + "-pattern-" + a), wi(f, r), f.disabled = n(), Z(p, "for", t.idPrefix + "-replacement-" + a), Z(m, "id", t.idPrefix + "-replacement-" + a), wi(m, i), m.disabled = n(), Z(h, "for", t.idPrefix + "-flags-" + a), Z(g, "id", t.idPrefix + "-flags-" + a), wi(g, c), g.disabled = n();
				}, [
					() => String(H(r).kind),
					() => String(H(r).pattern),
					() => String(H(r).replacement ?? ""),
					() => String(H(r).flags ?? "")
				]), W("change", s, (e) => y(a, "kind", e.currentTarget.value)), W("input", f, (e) => y(a, "pattern", e.currentTarget.value)), W("input", m, (e) => y(a, "replacement", e.currentTarget.value)), W("input", g, (e) => y(a, "flags", e.currentTarget.value)), K(e, i);
			};
			J(d, (e) => {
				t.control.structured === "durations" ? e(p) : t.control.structured === "numeric-map" ? e(m, 1) : t.control.structured === "fields" ? e(h, 2) : t.control.structured === "slots" ? e(g, 3) : t.control.structured === "sections" ? e(_, 4) : e(v, -1);
			});
			var b = B(d, 2), D = R(b), O = (e) => {
				var t = Ss(), r = z(t), i = B(r);
				V(() => {
					Z(r, "aria-label", "Move " + H(c) + " " + (a + 1) + " up"), r.disabled = n() || a === 0, Z(i, "aria-label", "Move " + H(c) + " " + (a + 1) + " down"), i.disabled = n() || a === H(f).length - 1;
				}), W("click", r, () => E(a, -1)), W("click", i, () => E(a, 1)), K(e, t);
			}, k = /* @__PURE__ */ F(() => !["numeric-map", "durations"].includes(t.control.structured ?? ""));
			J(D, (e) => {
				H(k) && e(O);
			});
			var A = B(D);
			P(b), P(o), V((e) => {
				q(l, `${e ?? ""} ${a + 1}`), Z(A, "aria-label", "Remove " + H(c) + " " + (a + 1)), A.disabled = n() || H(f).length <= H(u);
			}, [() => H(c)[0].toUpperCase() + H(c).slice(1)]), W("click", A, () => T(a)), K(e, o);
		}), P(a);
		var o = B(a, 2), s = R(o);
		P(o), V(() => {
			Z(o, "aria-label", "Add " + H(c)), o.disabled = n() || H(f).length >= H(l), q(s, `Add ${H(c) ?? ""}`);
		}), W("click", o, b), K(e, r);
	};
	J(j, (e) => {
		H(m) ? e(M) : H(f) && e(ee, 1);
	}), P(D), V(() => {
		Z(D, "data-structured-control", t.control.structured), Z(k, "aria-label", "Edit " + t.control.label + (H(m) ? " as rows" : " as JSON")), k.disabled = n() || H(m) && !H(f), q(A, H(m) ? "Use rows" : "Edit JSON");
	}), W("click", k, () => {
		!n() && H(f) && L(p, !H(m));
	}), K(e, D), We();
}
Er([
	"click",
	"input",
	"change"
]);
//#endregion
//#region ui/DetailControl.svelte
var Ds = /* @__PURE__ */ G("<span class=\"pc-control-label svelte-16a137\"> </span> <!>", 1), Os = /* @__PURE__ */ G("<label class=\"pc-detail-check svelte-16a137\"><input type=\"checkbox\" class=\"svelte-16a137\"/> </label>"), ks = /* @__PURE__ */ G("<label class=\"svelte-16a137\"><input type=\"radio\" class=\"svelte-16a137\"/><span class=\"svelte-16a137\"> </span></label>"), As = /* @__PURE__ */ G("<span class=\"pc-control-label svelte-16a137\"> </span> <div class=\"pc-control-segments svelte-16a137\" role=\"radiogroup\"></div>", 1), js = /* @__PURE__ */ G("<option class=\"svelte-16a137\"> </option>"), Ms = /* @__PURE__ */ G("<select class=\"svelte-16a137\"></select>"), Ns = /* @__PURE__ */ G("<input type=\"number\" class=\"svelte-16a137\"/>"), Ps = /* @__PURE__ */ G("<textarea class=\"svelte-16a137\"></textarea>"), Fs = /* @__PURE__ */ G("<input type=\"text\" class=\"svelte-16a137\"/>"), Is = /* @__PURE__ */ G("<label class=\"svelte-16a137\"> </label> <!>", 1), Ls = /* @__PURE__ */ G("<button type=\"button\" class=\"svelte-16a137\"> </button>"), Rs = /* @__PURE__ */ G("<small class=\"svelte-16a137\"> </small>"), zs = /* @__PURE__ */ G("<div class=\"pc-detail-error svelte-16a137\"><!></div>"), Bs = /* @__PURE__ */ G("<div><!> <!> <!> <!> <!></div>");
function Vs(e, t) {
	Ue(t, !0);
	let n = Pi(t, "error", 3, ""), r = Pi(t, "disabled", 3, !1), i = Pi(t, "pending", 3, !1), a = () => t.control.editor === "enum" && (t.control.options?.length ?? 0) > 1 && (t.control.options?.length ?? 0) <= 3 && t.control.options.every((e) => e.label.length <= 10), o = () => t.control.effective !== void 0 && t.control.effective !== t.text && t.control.source !== "Saved setting" ? t.control.source : "";
	var s = Bs();
	let c;
	var l = R(s), u = (e) => {
		var i = Ds(), a = z(i), o = R(a, !0);
		P(a), Es(B(a, 2), {
			get control() {
				return t.control;
			},
			get text() {
				return t.text;
			},
			get disabled() {
				return r();
			},
			get ontext() {
				return t.ontext;
			},
			get onDraft() {
				return t.onDraft;
			},
			get draftValue() {
				return t.draftValue;
			},
			get idPrefix() {
				return t.idPrefix;
			},
			get error() {
				return n();
			}
		}), V(() => q(o, t.control.label)), K(e, i);
	}, d = (e) => {
		var n = Os(), i = R(n);
		X(i);
		var a = B(i, 1, !0);
		P(n), V((e) => {
			Z(i, "aria-label", t.control.label), Ti(i, e), i.disabled = r(), q(a, t.control.label);
		}, [() => !!t.control.value]), W("change", i, (e) => {
			r() || t.onvalue(e.currentTarget.checked);
		}), K(e, n);
	}, f = (e) => {
		var n = As(), i = z(n), a = R(i, !0);
		P(i);
		var o = B(i, 2);
		Y(o, 21, () => t.control.options ?? [], (e) => e.value, (e, n) => {
			var i = ks(), a = R(i);
			X(a);
			var o = B(a), s = R(o, !0);
			P(o), P(i), V((e) => {
				Z(a, "name", t.idPrefix + "-choice"), Z(a, "aria-label", H(n).label), wi(a, H(n).value), Ti(a, e), a.disabled = r(), q(s, H(n).label);
			}, [() => String(t.control.value) === H(n).value]), W("change", a, (e) => {
				!r() && e.currentTarget.checked && t.onvalue(H(n).value);
			}), K(e, i);
		}), P(o), V(() => {
			q(a, t.control.label), Z(o, "aria-label", t.control.label);
		}), K(e, n);
	}, p = /* @__PURE__ */ F(() => a()), m = (e) => {
		var i = Is(), a = z(i), o = R(a, !0);
		P(a);
		var s = B(a, 2), c = (e) => {
			var n = Ms();
			Y(n, 21, () => t.control.options ?? [], (e) => e.value, (e, t) => {
				var n = js(), r = R(n, !0);
				P(n);
				var i = {};
				V(() => {
					q(r, H(t).label), i !== (i = H(t).value) && (n.value = (n.__value = H(t).value) ?? "");
				}), K(e, n);
			}), P(n);
			var i;
			_i(n), V((e) => {
				Z(n, "id", t.idPrefix + "-editor"), Z(n, "aria-label", t.control.label), n.disabled = r(), i !== (i = e) && (n.value = (n.__value = e) ?? "", gi(n, e));
			}, [() => String(t.control.value)]), W("change", n, (e) => {
				r() || t.onvalue(e.currentTarget.value);
			}), K(e, n);
		}, l = (e) => {
			var i = Ns();
			X(i), V((e) => {
				Z(i, "id", t.idPrefix + "-editor"), Z(i, "aria-label", t.control.label), Z(i, "min", t.control.min), Z(i, "max", t.control.max), Z(i, "step", t.control.step ?? 1), Z(i, "aria-invalid", !!n()), Z(i, "aria-describedby", n() ? t.idPrefix + "-error" : void 0), wi(i, e), i.disabled = r();
			}, [() => Number(t.control.value)]), W("change", i, (e) => {
				r() || t.onnumber(e.currentTarget);
			}), K(e, i);
		}, u = (e) => {
			var i = Ps();
			at(i), V(() => {
				Z(i, "id", t.idPrefix + "-editor"), Z(i, "aria-label", t.control.label), Z(i, "aria-invalid", !!n()), Z(i, "aria-describedby", n() ? t.idPrefix + "-error" : void 0), wi(i, t.text), i.disabled = r();
			}), W("input", i, (e) => {
				r() || t.ontext(e.currentTarget.value);
			}), K(e, i);
		}, d = (e) => {
			var n = Fs();
			X(n), V(() => {
				Z(n, "id", t.idPrefix + "-editor"), Z(n, "aria-label", t.control.label), wi(n, t.text), n.disabled = r();
			}), W("change", n, (e) => {
				r() || t.onvalue(e.currentTarget.value);
			}), K(e, n);
		}, f = /* @__PURE__ */ F(() => t.control.singleLine && t.control.editor === "text" && !t.text.includes("\n") && !t.text.includes("\r")), p = (e) => {
			var n = Ps();
			at(n), V(() => {
				Z(n, "id", t.idPrefix + "-editor"), Z(n, "aria-label", t.control.label), wi(n, t.text), n.disabled = r();
			}), W("change", n, (e) => {
				r() || t.onvalue(e.currentTarget.value);
			}), K(e, n);
		};
		J(s, (e) => {
			t.control.editor === "enum" ? e(c) : t.control.editor === "number" ? e(l, 1) : t.control.editor === "json" || t.control.editor === "lines" ? e(u, 2) : H(f) ? e(d, 3) : e(p, -1);
		}), V(() => {
			Z(a, "for", t.idPrefix + "-editor"), q(o, t.control.label);
		}), K(e, i);
	};
	J(l, (e) => {
		t.control.structured && t.control.editor === "json" ? e(u) : t.control.editor === "boolean" ? e(d, 1) : H(p) ? e(f, 2) : e(m, -1);
	});
	var h = B(l, 2), g = (e) => {
		var n = Ls(), a = R(n, !0);
		P(n), V(() => {
			Z(n, "data-save-control", t.control.key), n.disabled = r() || i(), q(a, i() ? "Validating…" : "Save " + t.control.label);
		}), W("click", n, () => {
			!r() && !i() && t.onsave();
		}), K(e, n);
	};
	J(h, (e) => {
		(t.control.editor === "json" || t.control.editor === "lines") && e(g);
	});
	var _ = B(h, 2), v = (e) => {
		var n = Rs(), r = R(n, !0);
		P(n), V(() => q(r, t.control.help)), K(e, n);
	};
	J(_, (e) => {
		t.control.help && e(v);
	});
	var y = B(_, 2), b = (e) => {
		var n = Rs(), r = R(n, !0);
		P(n), V(() => q(r, t.control.exposureNote)), K(e, n);
	}, x = (e) => {
		var n = Rs(), r = R(n);
		P(n), V((e) => q(r, `${e ?? ""} · Effective: ${t.control.effective ?? ""}`), [() => o()]), K(e, n);
	}, S = /* @__PURE__ */ F(() => o());
	J(y, (e) => {
		t.control.exposureNote ? e(b) : H(S) && e(x, 1);
	});
	var C = B(y, 2), w = (e) => {
		var r = zs(), i = R(r);
		{
			let e = /* @__PURE__ */ F(() => ({ inputLabel: t.control.label }));
			go(i, {
				get issue() {
					return n();
				},
				get context() {
					return H(e);
				}
			});
		}
		P(r), V(() => Z(r, "id", t.idPrefix + "-error")), K(e, r);
	};
	J(C, (e) => {
		n() && e(w);
	}), P(s), V(() => c = pi(s, 1, "pc-detail-control svelte-16a137", null, c, { "pc-control-number": t.control.editor === "number" })), K(e, s), We();
}
Er([
	"change",
	"input",
	"click"
]);
//#endregion
//#region ui/RecallDetails.svelte
var Hs = /* @__PURE__ */ G("<p class=\"svelte-1kifnmo\"> </p>"), Us = /* @__PURE__ */ G("<div><!></div>"), Ws = /* @__PURE__ */ G("<p class=\"svelte-1kifnmo\">Add a matching Recall node and connect it to the workflow. Queueing this Shortcut has an effect when that Recall executes.</p>"), Gs = /* @__PURE__ */ G("<button type=\"button\" class=\"pc-recall-link svelte-1kifnmo\"> </button>"), Ks = /* @__PURE__ */ G("<section class=\"pc-recall-details svelte-1kifnmo\" aria-label=\"Memory recall\"><h3 class=\"svelte-1kifnmo\">Memory recall</h3><p role=\"status\" class=\"svelte-1kifnmo\"> </p> <dl class=\"svelte-1kifnmo\"><dt class=\"svelte-1kifnmo\">Memory set</dt><dd class=\"svelte-1kifnmo\"> </dd><dt class=\"svelte-1kifnmo\">Target</dt><dd class=\"svelte-1kifnmo\"> </dd><dt class=\"svelte-1kifnmo\">Repetition</dt><dd class=\"svelte-1kifnmo\"> </dd><dt class=\"svelte-1kifnmo\">Consume on</dt><dd class=\"svelte-1kifnmo\"> </dd></dl> <!> <!> <div class=\"pc-detail-actions svelte-1kifnmo\"><button type=\"button\">Queue recall</button><button type=\"button\">Cancel recall</button></div> <!><!><!> <!> <!> <small class=\"svelte-1kifnmo\">Matching nodes share one request. The first successful matching Recall supplies the selection for a generation. Use different memory-set IDs for independent selections. Automatic triggers keep their own conditions.</small></section>");
function qs(e, t) {
	let n = Rr();
	Ue(t, !0);
	let r = /* @__PURE__ */ I(!1), i = /* @__PURE__ */ I(""), a = "", o = 0, s = /* @__PURE__ */ F(() => t.view.address ? JSON.stringify([
		t.view.address.workflowId,
		t.view.address.instancePath,
		t.view.address.nodeId
	]) : t.view.nodeId), c = /* @__PURE__ */ F(() => H(r) ? "Wait for the Recall change to finish." : t.actions.queue ? t.view.queueAllowed ? "" : t.view.reason || "Recall is already queued." : "Queue recall is unavailable in this workspace."), l = /* @__PURE__ */ F(() => H(r) ? "Wait for the Recall change to finish." : t.actions.cancel ? t.view.cancelAllowed ? "" : "No recall is queued to cancel." : "Cancel recall is unavailable in this workspace.");
	Cn(() => {
		a !== H(s) && (a = H(s), o++, L(r, !1), L(i, ""));
	});
	async function u(e) {
		if (H(r)) return;
		let n = H(s), a = ++o;
		L(r, !0), L(i, "");
		try {
			let r = await t.actions[e]?.();
			a === o && n === H(s) && r?.ok !== !0 && L(i, (r?.error ? r.error.code + ": " + r.error.message : void 0) ?? "Memory recall is unavailable.", !0);
		} catch {
			a === o && n === H(s) && L(i, "Memory recall could not be updated.");
		} finally {
			a === o && n === H(s) && L(r, !1);
		}
	}
	var d = Ks(), f = B(R(d)), p = R(f, !0);
	P(f);
	var m = B(f, 2), h = B(R(m)), g = R(h, !0);
	P(h);
	var _ = B(h, 2), v = R(_, !0);
	P(_);
	var y = B(_, 2), b = R(y, !0);
	P(y);
	var x = B(y, 2), S = R(x, !0);
	P(x), P(m);
	var C = B(m, 2), w = (e) => {
		var n = Hs(), r = R(n);
		P(n), V(() => q(r, `Remaining: ${t.view.remainingText ?? ""}`)), K(e, n);
	};
	J(C, (e) => {
		t.view.queued && e(w);
	});
	var T = B(C, 2), E = (e) => {
		var n = Hs(), r = R(n);
		P(n), V(() => q(r, `Pending generations: ${t.view.pendingCount ?? ""}`)), K(e, n);
	};
	J(T, (e) => {
		t.view.pendingCount && e(E);
	});
	var D = B(T, 2), O = R(D), k = B(O);
	P(D);
	var A = B(D, 2), j = (e) => {
		var t = Hs(), r = R(t, !0);
		P(t), V(() => {
			Z(t, "id", n + "-queue-reason"), q(r, H(c));
		}), K(e, t);
	}, M = (e) => {
		var n = Hs(), r = R(n, !0);
		P(n), V(() => q(r, t.view.reason)), K(e, n);
	};
	J(A, (e) => {
		H(c) ? e(j) : t.view.reason && e(M, 1);
	});
	var ee = B(A), te = (e) => {
		var t = Hs(), r = R(t, !0);
		P(t), V(() => {
			Z(t, "id", n + "-cancel-reason"), q(r, H(l));
		}), K(e, t);
	};
	J(ee, (e) => {
		H(l) && e(te);
	});
	var ne = B(ee), re = (e) => {
		var t = Us();
		go(R(t), { get issue() {
			return H(i);
		} }), P(t), K(e, t);
	};
	J(ne, (e) => {
		H(i) && e(re);
	});
	var ie = B(ne, 2), ae = (e) => {
		K(e, Ws());
	}, oe = /* @__PURE__ */ F(() => t.view.shortcutNodeIds.includes(H(s)) && t.view.consumerCount === 0);
	J(ie, (e) => {
		H(oe) && e(ae);
	}), Y(B(ie, 2), 17, () => t.view.hotkeys, (e) => e.nodeId, (e, n) => {
		var r = Gs(), i = R(r);
		P(r), V(() => {
			r.disabled = !t.actions.revealShortcut, q(i, `Recall Shortcut · ${H(n).label ?? ""}`);
		}), W("click", r, () => t.actions.revealShortcut?.(H(n).nodeId)), K(e, r);
	}), Me(2), P(d), V(() => {
		q(p, t.view.statusText), q(g, t.view.memorySetId || "Choose a memory set"), q(v, t.view.targetLabel), q(b, t.view.useLabel), q(S, t.view.consumeLabel), O.disabled = H(r) || !t.view.queueAllowed || !t.actions.queue, Z(O, "aria-describedby", H(c) ? n + "-queue-reason" : void 0), k.disabled = H(r) || !t.view.cancelAllowed || !t.actions.cancel, Z(k, "aria-describedby", H(l) ? n + "-cancel-reason" : void 0);
	}), W("click", O, () => u("queue")), W("click", k, () => u("cancel")), K(e, d), We();
}
Er(["click"]);
//#endregion
//#region ui/ModifierStack.svelte
var Js = /* @__PURE__ */ G("<label class=\"svelte-1ibq9q\"><input type=\"checkbox\" class=\"svelte-1ibq9q\"/> </label>"), Ys = /* @__PURE__ */ G("<option class=\"svelte-1ibq9q\"> </option>"), Xs = /* @__PURE__ */ G("<label class=\"pc-modifier-check svelte-1ibq9q\"><input type=\"checkbox\" class=\"svelte-1ibq9q\"/> </label>"), Zs = /* @__PURE__ */ G("<select class=\"svelte-1ibq9q\"></select>"), Qs = /* @__PURE__ */ G("<input type=\"number\" class=\"svelte-1ibq9q\"/>"), $s = /* @__PURE__ */ G("<textarea class=\"svelte-1ibq9q\"></textarea>"), ec = /* @__PURE__ */ G("<label class=\"svelte-1ibq9q\"> </label> <!>", 1), tc = /* @__PURE__ */ G("<small class=\"svelte-1ibq9q\"> </small>"), nc = /* @__PURE__ */ G("<!> <!>", 1), rc = /* @__PURE__ */ G("<details class=\"svelte-1ibq9q\"><summary class=\"svelte-1ibq9q\"> <!></summary> <!> <button type=\"button\" class=\"svelte-1ibq9q\"> </button></details>"), ic = /* @__PURE__ */ G("<div class=\"pc-modifier-error svelte-1ibq9q\"><!></div>"), ac = /* @__PURE__ */ G("<div class=\"pc-modifier-entry svelte-1ibq9q\"><div class=\"pc-modifier-heading svelte-1ibq9q\"><label class=\"svelte-1ibq9q\"><input type=\"checkbox\" class=\"svelte-1ibq9q\"/><span class=\"svelte-1ibq9q\"> <small class=\"svelte-1ibq9q\"> </small></span></label> <div class=\"pc-modifier-order svelte-1ibq9q\"><button type=\"button\" title=\"Move up\" class=\"svelte-1ibq9q\">↑</button> <button type=\"button\" title=\"Move down\" class=\"svelte-1ibq9q\">↓</button> <button type=\"button\" title=\"Remove\" class=\"svelte-1ibq9q\">×</button></div></div> <!> <!></div>"), oc = /* @__PURE__ */ G("<div class=\"pc-modifier-stack svelte-1ibq9q\"><small class=\"svelte-1ibq9q\"> </small> <!></div>"), sc = /* @__PURE__ */ G("<small role=\"status\" class=\"svelte-1ibq9q\">Validating modifiers…</small>"), cc = /* @__PURE__ */ G("<section class=\"pc-modifiers svelte-1ibq9q\" data-modifier-controls=\"\" aria-label=\"Text modifiers\"><div class=\"pc-modifier-quick svelte-1ibq9q\"><!> <select aria-label=\"Add text modifier\" class=\"svelte-1ibq9q\"><option class=\"svelte-1ibq9q\">Add modifier…</option><!></select></div> <!> <!> <!></section>");
function lc(e, t) {
	Ue(t, !0);
	let n = (e) => t.options.find((t) => t.type === e.type), r = (e) => n(e)?.label ?? e.type, i = (e) => t.drafts[e.id]?.settings ?? e.settings, a = (e) => t.disabled || t.busy || !t.options.some((t) => t.type === e) || t.items.length >= 16 && !t.items.some((t) => t.type === e);
	var o = cc(), s = R(o), c = R(s);
	Y(c, 16, () => ["trim", "wrap"], qr, (e, n) => {
		var r = Js(), i = R(r);
		X(i);
		var o = B(i, 1, !0);
		P(r), V((e, t) => {
			Z(i, "aria-label", (n === "trim" ? "Trim" : "Wrap") + " output"), Ti(i, e), i.disabled = t, q(o, n === "trim" ? "Trim" : "Wrap");
		}, [() => t.items.some((e) => e.type === n && e.enabled), () => a(n)]), W("change", i, (e) => {
			a(n) || t.onquick(n, e.currentTarget.checked);
		}), K(e, r);
	});
	var l = B(c, 2), u = R(l);
	u.value = u.__value = "", Y(B(u), 17, () => t.options.filter((e) => !["trim", "wrap"].includes(e.type)), (e) => e.type, (e, t) => {
		var n = Ys(), r = R(n, !0);
		P(n);
		var i = {};
		V(() => {
			q(r, H(t).label), i !== (i = H(t).type) && (n.value = (n.__value = H(t).type) ?? "");
		}), K(e, n);
	}), P(l), l.value = l.__value = "", P(s);
	var d = B(s, 2), f = (e) => {
		var a = oc(), o = R(a), s = R(o);
		P(o), Y(B(o, 2), 19, () => t.items, (e) => e.id, (e, a, o) => {
			let s = /* @__PURE__ */ F(() => n(H(a))), c = /* @__PURE__ */ F(() => r(H(a))), l = /* @__PURE__ */ F(() => t.drafts[H(a).id]);
			var u = ac(), d = R(u), f = R(d), p = R(f);
			X(p);
			var m = B(p), h = R(m), g = B(h), _ = R(g, !0);
			P(g), P(m), P(f);
			var v = B(f, 2), y = R(v), b = B(y, 2), x = B(b, 2);
			P(v), P(d);
			var S = B(d, 2), C = (e) => {
				var n = rc(), r = R(n), o = R(r), u = B(o), d = (e) => {
					K(e, Ir("· Unsaved"));
				};
				J(u, (e) => {
					H(l)?.dirty && e(d);
				}), P(r);
				var f = B(r, 2);
				Y(f, 17, () => H(s).fields, (e) => e.key, (e, n) => {
					let r = /* @__PURE__ */ F(() => t.idPrefix + "-modifier-" + H(a).id + "-" + H(n).key);
					var o = nc(), s = z(o), l = (e) => {
						var o = Xs(), s = R(o);
						X(s);
						var l = B(s, 1, !0);
						P(o), V((e) => {
							Z(s, "id", H(r)), Z(s, "aria-label", H(c) + " " + H(n).label), Ti(s, e), s.disabled = t.disabled, q(l, H(n).label);
						}, [() => !!i(H(a))[H(n).key]]), W("change", s, (e) => {
							t.disabled || t.ondraft(H(a).id, H(n).key, e.currentTarget.checked);
						}), K(e, o);
					}, u = (e) => {
						var o = ec(), s = z(o), l = R(s, !0);
						P(s);
						var u = B(s, 2), d = (e) => {
							var o = Zs();
							Y(o, 21, () => H(n).options ?? [], (e) => e.value, (e, t) => {
								var n = Ys(), r = R(n, !0);
								P(n);
								var i = {};
								V(() => {
									q(r, H(t).label), i !== (i = H(t).value) && (n.value = (n.__value = H(t).value) ?? "");
								}), K(e, n);
							}), P(o);
							var s;
							_i(o), V((e) => {
								Z(o, "id", H(r)), Z(o, "aria-label", H(c) + " " + H(n).label), o.disabled = t.disabled, s !== (s = e) && (o.value = (o.__value = e) ?? "", gi(o, e));
							}, [() => String(i(H(a))[H(n).key] ?? "")]), W("change", o, (e) => {
								t.disabled || t.ondraft(H(a).id, H(n).key, e.currentTarget.value);
							}), K(e, o);
						}, f = (e) => {
							var o = Qs();
							X(o), V((e) => {
								Z(o, "id", H(r)), Z(o, "aria-label", H(c) + " " + H(n).label), Z(o, "min", H(n).min), Z(o, "max", H(n).max), Z(o, "step", H(n).step ?? 1), wi(o, e), o.disabled = t.disabled;
							}, [() => String(i(H(a))[H(n).key] ?? "")]), W("input", o, (e) => {
								t.disabled || t.ondraft(H(a).id, H(n).key, e.currentTarget.value ? Number(e.currentTarget.value) : null);
							}), K(e, o);
						}, p = (e) => {
							var o = $s();
							at(o), V((e) => {
								Z(o, "id", H(r)), Z(o, "aria-label", H(c) + " " + H(n).label), wi(o, e), o.disabled = t.disabled;
							}, [() => String(i(H(a))[H(n).key] ?? "")]), W("input", o, (e) => {
								t.disabled || t.ondraft(H(a).id, H(n).key, e.currentTarget.value);
							}), K(e, o);
						};
						J(u, (e) => {
							H(n).editor === "enum" ? e(d) : H(n).editor === "number" ? e(f, 1) : e(p, -1);
						}), V(() => {
							Z(s, "for", H(r)), q(l, H(n).label);
						}), K(e, o);
					};
					J(s, (e) => {
						H(n).editor === "boolean" ? e(l) : e(u, -1);
					});
					var d = B(s, 2), f = (e) => {
						var t = tc(), r = R(t, !0);
						P(t), V(() => q(r, H(n).help)), K(e, t);
					};
					J(d, (e) => {
						H(n).help && e(f);
					}), K(e, o);
				});
				var p = B(f, 2), m = R(p, !0);
				P(p), P(n), V(() => {
					n.open = !!H(l)?.dirty || !!H(l)?.error, q(o, `${H(c) ?? ""} settings`), Z(p, "aria-label", "Save " + H(c) + " settings"), p.disabled = t.disabled || !!H(l)?.pending || !H(l)?.dirty, q(m, H(l)?.pending ? "Validating…" : "Save settings");
				}), W("click", p, () => {
					!t.disabled && !H(l)?.pending && H(l)?.dirty && t.onsave(H(a).id);
				}), K(e, n);
			};
			J(S, (e) => {
				H(s)?.fields.length && e(C);
			});
			var w = B(S, 2), T = (e) => {
				var t = ic();
				go(R(t), { get issue() {
					return H(l).error;
				} }), P(t), K(e, t);
			};
			J(w, (e) => {
				H(l)?.error && e(T);
			}), P(u), V(() => {
				Z(u, "data-modifier-id", H(a).id), Z(u, "data-modifier-state", H(a).enabled ? "active" : "disabled"), Z(p, "aria-label", "Enable " + H(c) + " modifier"), Ti(p, H(a).enabled), p.disabled = t.disabled || t.busy, q(h, `${H(o) + 1}. ${H(c) ?? ""}`), q(_, H(a).enabled ? "Active" : "Disabled"), Z(y, "aria-label", "Move " + H(c) + " up"), y.disabled = t.disabled || t.busy || H(o) === 0, Z(b, "aria-label", "Move " + H(c) + " down"), b.disabled = t.disabled || t.busy || H(o) === t.items.length - 1, Z(x, "aria-label", "Remove " + H(c) + " modifier"), x.disabled = t.disabled || t.busy;
			}), W("change", p, (e) => {
				!t.disabled && !t.busy && t.onenable(H(a).id, e.currentTarget.checked);
			}), W("click", y, () => {
				!t.disabled && !t.busy && H(o) > 0 && t.onmove(H(a).id, -1);
			}), W("click", b, () => {
				!t.disabled && !t.busy && H(o) < t.items.length - 1 && t.onmove(H(a).id, 1);
			}), W("click", x, () => {
				!t.disabled && !t.busy && t.onremove(H(a).id);
			}), K(e, u);
		}), P(a), V((e) => q(s, `${e ?? ""} active · ${t.items.length ?? ""} total · Applied in order`), [() => t.items.filter((e) => e.enabled).length]), K(e, a);
	};
	J(d, (e) => {
		t.items.length && e(f);
	});
	var p = B(d, 2), m = (e) => {
		K(e, sc());
	};
	J(p, (e) => {
		t.busy && e(m);
	});
	var h = B(p, 2), g = (e) => {
		var n = ic();
		go(R(n), { get issue() {
			return t.error;
		} }), P(n), K(e, n);
	};
	J(h, (e) => {
		t.error && e(g);
	}), P(o), V(() => l.disabled = t.disabled || t.busy || t.items.length >= 16), W("change", l, (e) => {
		let n = e.currentTarget.value;
		e.currentTarget.value = "", !t.disabled && !t.busy && t.items.length < 16 && n && t.onadd(n);
	}), K(e, o), We();
}
Er([
	"change",
	"click",
	"input"
]);
//#endregion
//#region ui/WorkflowData.svelte
var uc = /* @__PURE__ */ G("<button type=\"button\" data-load-workflow-data=\"\" class=\"svelte-8bs3bu\"> </button>"), dc = /* @__PURE__ */ G("<label class=\"pc-wd-number svelte-8bs3bu\"><span class=\"svelte-8bs3bu\">Starting day</span><input aria-label=\"Starting day\" type=\"number\" min=\"1\" step=\"1\" class=\"svelte-8bs3bu\"/></label> <label class=\"pc-wd-number svelte-8bs3bu\"><span class=\"svelte-8bs3bu\">Starting time</span><input aria-label=\"Starting time\" type=\"text\" inputmode=\"numeric\" placeholder=\"00:00\" class=\"svelte-8bs3bu\"/></label> <label class=\"pc-wd-number svelte-8bs3bu\"><span class=\"svelte-8bs3bu\">Hours per day</span><input aria-label=\"Hours per day\" type=\"number\" step=\"any\" class=\"svelte-8bs3bu\"/></label> <p class=\"pc-wd-help svelte-8bs3bu\">Initial values only. Saved time stays unchanged.</p>", 1), fc = /* @__PURE__ */ G("<label class=\"pc-wd-block svelte-8bs3bu\"> <textarea rows=\"4\" maxlength=\"100000\" class=\"svelte-8bs3bu\"></textarea></label> <p class=\"pc-wd-help svelte-8bs3bu\"> </p>", 1), pc = /* @__PURE__ */ G("<output class=\"pc-wd-source-value svelte-8bs3bu\"> </output>"), mc = /* @__PURE__ */ G("<button type=\"button\" class=\"svelte-8bs3bu\"> </button>"), hc = /* @__PURE__ */ G("<div class=\"pc-wd-choices svelte-8bs3bu\" role=\"group\"></div>"), gc = /* @__PURE__ */ G("<option class=\"svelte-8bs3bu\"> </option>"), _c = /* @__PURE__ */ G("<select class=\"svelte-8bs3bu\"><!><!></select>"), vc = /* @__PURE__ */ G("<div class=\"pc-wd-create svelte-8bs3bu\"><label class=\"pc-wd-field svelte-8bs3bu\">Name<input maxlength=\"256\" class=\"svelte-8bs3bu\"/></label> <div class=\"pc-wd-actions svelte-8bs3bu\"><button type=\"button\" data-create-workflow-data=\"\" class=\"svelte-8bs3bu\"> </button><button type=\"button\" class=\"svelte-8bs3bu\">Cancel</button></div></div>"), yc = /* @__PURE__ */ G("<label class=\"pc-wd-field svelte-8bs3bu\">Format<select aria-label=\"Document format\" class=\"svelte-8bs3bu\"></select></label><p class=\"pc-wd-help svelte-8bs3bu\">A saved document keeps its format.</p>", 1), bc = /* @__PURE__ */ G("<div class=\"pc-wd-field svelte-8bs3bu\"><span class=\"svelte-8bs3bu\">Format</span><output class=\"svelte-8bs3bu\">JSON</output></div><p class=\"pc-wd-help svelte-8bs3bu\"> </p>", 1), xc = /* @__PURE__ */ G("<label class=\"pc-wd-field svelte-8bs3bu\">Actor ID<input aria-label=\"Private actor ID\" maxlength=\"128\" class=\"svelte-8bs3bu\"/></label>"), Sc = /* @__PURE__ */ G("<label class=\"pc-wd-field svelte-8bs3bu\">Columns<input aria-label=\"CSV columns\" placeholder=\"id, text\" class=\"svelte-8bs3bu\"/></label>"), Cc = /* @__PURE__ */ G("<label class=\"pc-wd-field svelte-8bs3bu\">Calendar<input aria-label=\"Initial calendar name\" class=\"svelte-8bs3bu\"/></label><label class=\"pc-wd-field svelte-8bs3bu\">Expected calendar<input aria-label=\"Expected calendar\" placeholder=\"Any calendar\" class=\"svelte-8bs3bu\"/></label><p class=\"pc-wd-help svelte-8bs3bu\">Expected calendar validates saved data.</p>", 1), wc = /* @__PURE__ */ G("<p class=\"pc-wd-help svelte-8bs3bu\">Open an active chat to save initial settings.</p>"), Tc = /* @__PURE__ */ G("<div class=\"pc-wd-help svelte-8bs3bu\"><!></div>"), Ec = /* @__PURE__ */ G("<div class=\"pc-wd-error svelte-8bs3bu\"><!></div>"), Dc = /* @__PURE__ */ G("<p class=\"pc-wd-help svelte-8bs3bu\" role=\"status\"> </p>"), Oc = /* @__PURE__ */ G("<div class=\"pc-workflow-data svelte-8bs3bu\"><p class=\"pc-wd-binding svelte-8bs3bu\"> </p> <details class=\"pc-wd-group svelte-8bs3bu\" data-workflow-initial=\"\"><summary class=\"svelte-8bs3bu\"> <span class=\"svelte-8bs3bu\"> </span></summary> <div class=\"pc-wd-body svelte-8bs3bu\"><!> <!></div></details> <details class=\"pc-wd-group svelte-8bs3bu\" data-workflow-advanced=\"\"><summary class=\"svelte-8bs3bu\">Advanced <span class=\"svelte-8bs3bu\"> </span></summary> <div class=\"pc-wd-body svelte-8bs3bu\"><div class=\"pc-wd-source-row svelte-8bs3bu\"><span class=\"pc-wd-row-label svelte-8bs3bu\"> </span> <!> <button type=\"button\" class=\"pc-wd-add svelte-8bs3bu\">+</button></div> <!> <p class=\"pc-wd-help svelte-8bs3bu\"> </p> <hr class=\"svelte-8bs3bu\"/> <!> <span class=\"pc-wd-label svelte-8bs3bu\">Visibility</span> <div class=\"pc-wd-choices svelte-8bs3bu\" role=\"group\"></div> <!> <!> <label class=\"pc-wd-field svelte-8bs3bu\">Document ID<input readonly=\"\" class=\"svelte-8bs3bu\"/></label> <!></div></details> <div class=\"pc-wd-actions pc-wd-save svelte-8bs3bu\"><button type=\"button\" data-save-workflow-data=\"\" class=\"svelte-8bs3bu\"> </button></div> <!> <!> <!> <!></div>");
function kc(e, t) {
	Ue(t, !0);
	let n = Pi(t, "actions", 19, () => ({})), r = Pi(t, "disabled", 3, !1), i = Pi(t, "idPrefix", 3, "pc-workflow-data"), a = /* @__PURE__ */ I(null), o = /* @__PURE__ */ I("1"), s = /* @__PURE__ */ I("00:00"), c = /* @__PURE__ */ I("24"), l = /* @__PURE__ */ I("story-calendar"), u = /* @__PURE__ */ I(""), d = /* @__PURE__ */ I("text"), f = /* @__PURE__ */ I("public"), p = /* @__PURE__ */ I(""), m = /* @__PURE__ */ I(""), h = /* @__PURE__ */ I(!1), g = /* @__PURE__ */ I(""), _ = /* @__PURE__ */ I(""), v = /* @__PURE__ */ I(""), y = /* @__PURE__ */ I(""), b = /* @__PURE__ */ I(!1), x = "", S = 0, C = !0, w = /* @__PURE__ */ F(() => t.model.kind === "clock" ? "Clock" : t.model.kind === "outcomes" ? "Outcomes" : "Document"), T = /* @__PURE__ */ F(() => t.model.kind === "clock" ? "clock" : t.model.kind === "outcomes" ? "outcomes" : "document"), E = /* @__PURE__ */ F(() => !r() && t.model.editable && !!H(a) && !H(_)), D = /* @__PURE__ */ F(() => !r() && t.model.editable && t.model.available && !H(_)), O = [
		{
			value: "public",
			label: "Public"
		},
		{
			value: "hidden",
			label: "Hidden"
		},
		{
			value: "actor-private",
			label: "Actor private"
		}
	], k = [
		{
			value: "text",
			label: "Plain text"
		},
		{
			value: "json",
			label: "JSON"
		},
		{
			value: "jsonl",
			label: "JSON Lines"
		},
		{
			value: "csv",
			label: "CSV"
		},
		{
			value: "markdown",
			label: "Markdown"
		}
	], A = (e) => k.find((t) => t.value === e)?.label ?? e, j = (e) => O.find((t) => t.value === e)?.label ?? e, M = () => JSON.stringify([
		t.selection.selectionKey,
		t.selection.address,
		t.model.targetId,
		t.model.key
	]);
	function ee(e) {
		L(a, e ? structuredClone(e) : null, !0), L(u, e?.content ?? "", !0), L(d, e?.format ?? t.model.format, !0), L(f, e?.visibility.kind ?? t.model.visibility.kind, !0);
		let n = e?.visibility ?? t.model.visibility;
		if (L(p, n.kind === "actor-private" ? n.actorId : "", !0), L(m, e?.columns?.join(", ") ?? "", !0), L(o, "1"), L(s, "00:00"), L(c, "24"), L(l, "story-calendar"), t.model.kind === "clock" && e) try {
			let t = JSON.parse(e.content), n = t.dayLengthMinutes;
			L(o, String(Math.floor(t.absoluteMinute / n) + 1), !0);
			let r = t.absoluteMinute % n;
			L(s, String(Math.floor(r / 60)).padStart(2, "0") + ":" + String(r % 60).padStart(2, "0")), L(c, String(n / 60), !0), L(l, t.calendarId, !0);
		} catch {
			L(a, null), L(v, "Load a valid clock template before changing its starting values.");
		}
		L(b, !1);
	}
	Cn(() => {
		let e = M();
		e !== x && (x = e, S++, L(_, ""), L(v, ""), L(y, ""), L(h, !1), L(g, ""), _r(() => ee(t.model.definition)));
	}), Ii(() => {
		C = !1, S++;
	});
	function te(e, t) {
		(e === "actor" ? !H(D) : !H(E)) || (L(e === "day" ? o : e === "time" ? s : e === "hours" ? c : e === "calendar" ? l : e === "content" ? u : e === "actor" ? p : m, t, !0), S++, L(b, !0), L(v, ""), L(y, ""));
	}
	function ne(e) {
		H(E) && t.model.kind === "notes" && (L(d, e, !0), H(u).trim() || L(u, e === "json" ? "[]" : "", !0), S++, L(b, !0), L(v, ""), L(y, ""));
	}
	function re(e) {
		H(D) && (L(f, e, !0), S++, L(b, !0), L(v, ""), L(y, ""));
	}
	function ie() {
		return H(f) === "actor-private" ? {
			kind: H(f),
			actorId: H(p).trim()
		} : { kind: H(f) };
	}
	function ae() {
		let e = Number(H(o)), t = Number(H(c)) * 60, n = /^(\d+):([0-5]\d)$/.exec(H(s)), r = n ? Number(n[1]) * 60 + Number(n[2]) : NaN, i = (e - 1) * t + r;
		if (!Number.isSafeInteger(e) || e < 1 || !Number.isSafeInteger(t) || t < 1 || !Number.isSafeInteger(r) || r < 0 || r >= t || !Number.isSafeInteger(i) || !H(l).trim()) throw Error("Use a positive starting day, a time within the day, and a day length in whole minutes.");
		return {
			calendarId: H(l).trim(),
			absoluteMinute: i,
			dayLengthMinutes: t
		};
	}
	function oe() {
		if (!H(a)) throw Error("Load the initial template before saving.");
		let e = {
			targetId: t.model.targetId,
			name: H(a).name,
			format: H(d),
			content: H(u),
			visibility: ie()
		};
		if (H(f) === "actor-private" && !H(p).trim()) throw Error("Choose an actor for private data.");
		return t.model.kind === "clock" && (e.content = JSON.stringify({
			...JSON.parse(H(a).content),
			...ae()
		}, null, 2)), H(d) === "csv" && (e.columns = H(m).split(",").map((e) => e.trim()).filter(Boolean)), e;
	}
	let se = /* @__PURE__ */ F(() => H(D) && (H(a) ? !!n().saveWorkflowData : !!n().saveWorkflowDataVisibility) && H(b) && (H(f) !== "actor-private" || !!H(p).trim()));
	async function ce(e, n) {
		if (r() || !t.model.editable || H(_)) return;
		let i = structuredClone(t.selection), a = t.model.key, o = M(), s = ++S, c = e === "load" && H(b) ? {
			visibility: H(f),
			actorId: H(p)
		} : null;
		L(_, e, !0), L(v, ""), L(y, "");
		try {
			let r = await n(i, a);
			if (!C || s !== S || o !== M() || t.selection.revision !== i.revision) return;
			if (!r.ok) {
				L(v, r.error.code + ": " + r.error.message);
				return;
			}
			if (e === "load") {
				if (!r.data?.definition) {
					L(v, "The initial template could not be loaded.");
					return;
				}
				ee(r.data.definition), c && (L(f, c.visibility, !0), L(p, c.actorId, !0), L(b, !0));
			} else L(b, !1), L(h, !1), L(y, r.data?.message ?? (e === "save" ? "Initial settings saved." : "Workflow data updated."), !0);
		} catch (e) {
			C && s === S && o === M() && t.selection.revision === i.revision && L(v, e instanceof Error ? e.message : "Workflow data could not be updated.", !0);
		} finally {
			C && s === S && o === M() && L(_, "");
		}
	}
	function le() {
		if (!H(se)) return;
		if (!H(a) && n().saveWorkflowDataVisibility) {
			ce("save", (e, t) => n().saveWorkflowDataVisibility(e, t, ie()));
			return;
		}
		if (!n().saveWorkflowData) return;
		let e;
		try {
			e = oe();
		} catch (e) {
			L(v, e instanceof Error ? e.message : "Check the initial settings.", !0);
			return;
		}
		ce("save", (t, r) => n().saveWorkflowData(t, r, e));
	}
	function ue(e) {
		!r() && t.model.editable && !H(_) && n().bindWorkflowData && e !== t.model.targetId && t.model.sources.some((t) => t.value === e) && ce("bind", (t, r) => n().bindWorkflowData(t, r, e));
	}
	function de() {
		if (r() || !t.model.editable || !t.model.available || H(_) || !n().createWorkflowData || !H(g).trim()) return;
		let e = {
			name: H(g).trim(),
			kind: t.model.kind,
			format: t.model.kind === "notes" ? H(d) : "json",
			visibility: ie()
		};
		try {
			if (H(f) === "actor-private" && !H(p).trim()) throw Error("Choose an actor for private data.");
			t.model.kind === "clock" && (e = {
				...e,
				...ae()
			});
		} catch (e) {
			L(v, e instanceof Error ? e.message : "Check the new data settings.", !0);
			return;
		}
		ce("create", (t, r) => n().createWorkflowData(t, r, e));
	}
	function fe(e) {
		!r() && t.model.editable && !H(_) && n().editControl && ce("calendar", (t) => n().editControl(t, "calendarId", e));
	}
	var pe = Oc(), me = R(pe), he = R(me);
	P(me);
	var ge = B(me, 2), _e = R(ge), ve = R(_e), ye = B(ve), be = R(ye, !0);
	P(ye), P(_e);
	var xe = B(_e, 2), Se = R(xe), Ce = (e) => {
		var i = uc(), a = R(i, !0);
		P(i), V(() => {
			i.disabled = r() || !t.model.editable || !t.model.available || !n().loadWorkflowData || !!H(_), q(a, H(_) === "load" ? "Loading…" : "Load initial values");
		}), W("click", i, () => {
			t.model.available && n().loadWorkflowData && ce("load", (e, t) => n().loadWorkflowData(e, t));
		}), K(e, i);
	};
	J(Se, (e) => {
		H(a) || e(Ce);
	});
	var we = B(Se, 2), Te = (e) => {
		var t = dc(), n = z(t), r = B(R(n));
		X(r), P(n);
		var i = B(n, 2), a = B(R(i));
		X(a), P(i);
		var l = B(i, 2), u = B(R(l));
		X(u), Z(u, "min", 1 / 60), P(l), Me(2), V(() => {
			wi(r, H(o)), r.disabled = !H(E), wi(a, H(s)), a.disabled = !H(E), wi(u, H(c)), u.disabled = !H(E);
		}), W("input", r, (e) => te("day", e.currentTarget.value)), W("input", a, (e) => te("time", e.currentTarget.value)), W("input", u, (e) => te("hours", e.currentTarget.value)), K(e, t);
	}, Ee = (e) => {
		var n = fc(), r = z(n), i = R(r, !0), a = B(i);
		at(a), P(r);
		var o = B(r, 2), s = R(o);
		P(o), V(() => {
			q(i, t.model.kind === "outcomes" ? "Starting records" : "Content"), Z(a, "aria-label", t.model.kind === "outcomes" ? "Initial outcomes" : "Initial document content"), wi(a, H(u)), a.disabled = !H(E), Z(a, "placeholder", t.model.kind === "outcomes" ? "[]" : "Empty by default"), q(s, `Initial content only. Saved ${t.model.kind === "outcomes" ? "outcomes" : "notes"} stay unchanged.`);
		}), W("input", a, (e) => te("content", e.currentTarget.value)), K(e, n);
	};
	J(we, (e) => {
		t.model.kind === "clock" ? e(Te) : e(Ee, -1);
	}), P(xe), P(ge);
	var De = B(ge, 2), N = R(De), Oe = B(R(N)), ke = R(Oe);
	P(Oe), P(N);
	var Ae = B(N, 2), je = R(Ae), Ne = R(je), Pe = R(Ne, !0);
	P(Ne);
	var Fe = B(Ne, 2), Ie = (e) => {
		var n = pc(), r = R(n, !0);
		P(n), V((e) => {
			Z(n, "aria-label", H(w) + " source"), q(r, e);
		}, [() => t.model.sources.find((e) => e.value === t.model.targetId)?.label ?? t.model.name ?? t.model.targetId]), K(e, n);
	}, Le = (e) => {
		var i = hc();
		Y(i, 21, () => t.model.sources, (e) => e.value, (e, i) => {
			var a = mc(), o = R(a, !0);
			P(a), V(() => {
				Z(a, "data-workflow-source", H(i).value), Z(a, "aria-pressed", H(i).value === t.model.targetId), a.disabled = r() || !t.model.editable || !n().bindWorkflowData || !!H(_), q(o, H(i).label);
			}), W("click", a, () => ue(H(i).value)), K(e, a);
		}), P(i), V(() => Z(i, "aria-label", H(w) + " source")), K(e, i);
	}, Re = (e) => {
		var i = _c(), a = R(i), o = (e) => {
			var n = gc(), r = R(n, !0);
			P(n);
			var i = {};
			V(() => {
				q(r, t.model.name || t.model.targetId), i !== (i = t.model.targetId) && (n.value = (n.__value = t.model.targetId) ?? "");
			}), K(e, n);
		}, s = /* @__PURE__ */ F(() => !t.model.sources.some((e) => e.value === t.model.targetId));
		J(a, (e) => {
			H(s) && e(o);
		}), Y(B(a), 17, () => t.model.sources, (e) => e.value, (e, t) => {
			var n = gc(), r = R(n, !0);
			P(n);
			var i = {};
			V(() => {
				q(r, H(t).label), i !== (i = H(t).value) && (n.value = (n.__value = H(t).value) ?? "");
			}), K(e, n);
		}), P(i);
		var c;
		_i(i), V(() => {
			Z(i, "aria-label", H(w) + " source"), i.disabled = r() || !t.model.editable || !n().bindWorkflowData || !!H(_), c !== (c = t.model.targetId) && (i.value = (i.__value = t.model.targetId) ?? "", gi(i, t.model.targetId));
		}), W("change", i, (e) => ue(e.currentTarget.value)), K(e, i);
	};
	J(Fe, (e) => {
		t.model.sources.length <= 1 ? e(Ie) : t.model.sources.length <= 3 ? e(Le, 1) : e(Re, -1);
	});
	var ze = B(Fe, 2);
	P(je);
	var Be = B(je, 2), Ve = (e) => {
		var t = vc(), n = R(t), r = B(R(n));
		X(r), P(n);
		var i = B(n, 2), a = R(i), o = R(a, !0);
		P(a);
		var s = B(a);
		P(i), P(t), V((e) => {
			Z(r, "aria-label", "New " + H(T) + " name"), wi(r, H(g)), r.disabled = !!H(_), a.disabled = e, q(o, H(_) === "create" ? "Creating…" : "Create " + H(T)), s.disabled = !!H(_);
		}, [() => !H(g).trim() || !!H(_) || H(f) === "actor-private" && !H(p).trim()]), W("input", r, (e) => {
			L(g, e.currentTarget.value, !0);
		}), W("click", a, de), W("click", s, () => {
			L(h, !1), L(v, "");
		}), K(e, t);
	};
	J(Be, (e) => {
		H(h) && e(Ve);
	});
	var He = B(Be, 2), Ge = R(He, !0);
	P(He);
	var Ke = B(He, 4), qe = (e) => {
		var t = yc(), n = z(t), r = B(R(n));
		Y(r, 21, () => k, qr, (e, t) => {
			var n = gc(), r = R(n, !0);
			P(n);
			var i = {};
			V(() => {
				q(r, H(t).label), i !== (i = H(t).value) && (n.value = (n.__value = H(t).value) ?? "");
			}), K(e, n);
		}), P(r);
		var i;
		_i(r), P(n), Me(), V(() => {
			r.disabled = !H(E), i !== (i = H(d)) && (r.value = (r.__value = H(d)) ?? "", gi(r, H(d)));
		}), W("change", r, (e) => ne(e.currentTarget.value)), K(e, t);
	}, Je = (e) => {
		var n = bc(), r = z(n), i = B(R(r));
		P(r);
		var a = B(r), o = R(a, !0);
		P(a), V(() => {
			Z(i, "aria-label", H(w) + " format"), q(o, t.model.kind === "clock" ? "Required for clock data." : "Outcomes use a JSON list.");
		}), K(e, n);
	};
	J(Ke, (e) => {
		t.model.kind === "notes" ? e(qe) : e(Je, -1);
	});
	var Ye = B(Ke, 2), Xe = B(Ye, 2);
	Y(Xe, 21, () => O, qr, (e, t) => {
		var n = mc(), r = R(n, !0);
		P(n), V(() => {
			Z(n, "data-workflow-visibility", H(t).value), Z(n, "aria-pressed", H(f) === H(t).value), n.disabled = !H(D), q(r, H(t).label);
		}), W("click", n, () => re(H(t).value)), K(e, n);
	}), P(Xe);
	var Ze = B(Xe, 2), Qe = (e) => {
		var t = xc(), n = B(R(t));
		X(n), P(t), V(() => {
			wi(n, H(p)), n.disabled = !H(D);
		}), W("input", n, (e) => te("actor", e.currentTarget.value)), K(e, t);
	};
	J(Ze, (e) => {
		H(f) === "actor-private" && e(Qe);
	});
	var $e = B(Ze, 2), et = (e) => {
		var t = Sc(), n = B(R(t));
		X(n), P(t), V(() => {
			wi(n, H(m)), n.disabled = !H(E);
		}), W("input", n, (e) => te("columns", e.currentTarget.value)), K(e, t);
	};
	J($e, (e) => {
		H(d) === "csv" && e(et);
	});
	var tt = B($e, 2), nt = B(R(tt));
	X(nt), P(tt);
	var rt = B(tt, 2), it = (e) => {
		var i = Cc(), a = z(i), o = B(R(a));
		X(o), P(a);
		var s = B(a), c = B(R(s));
		X(c), P(s), Me(), V(() => {
			wi(o, H(l)), o.disabled = !H(E), wi(c, t.model.expectedCalendar ?? ""), c.disabled = r() || !t.model.editable || !n().editControl || !!H(_);
		}), W("input", o, (e) => te("calendar", e.currentTarget.value)), W("change", c, (e) => fe(e.currentTarget.value)), K(e, i);
	};
	J(rt, (e) => {
		t.model.kind === "clock" && e(it);
	}), P(Ae), P(De);
	var ot = B(De, 2), st = R(ot), ct = R(st, !0);
	P(st), P(ot);
	var lt = B(ot, 2), ut = (e) => {
		K(e, wc());
	};
	J(lt, (e) => {
		t.model.available || e(ut);
	});
	var dt = B(lt, 2), ft = (e) => {
		var n = Tc();
		go(R(n), { get issue() {
			return t.model.issue;
		} }), P(n), K(e, n);
	};
	J(dt, (e) => {
		t.model.issue && e(ft);
	});
	var pt = B(dt, 2), mt = (e) => {
		var t = Ec();
		go(R(t), { get issue() {
			return H(v);
		} }), P(t), K(e, t);
	};
	J(pt, (e) => {
		H(v) && e(mt);
	});
	var ht = B(pt, 2), gt = (e) => {
		var n = Dc(), r = R(n, !0);
		P(n), V(() => q(r, H(y) || t.model.notice)), K(e, n);
	};
	J(ht, (e) => {
		(H(y) || !H(b) && t.model.notice) && e(gt);
	}), P(pe), V((e, a, o) => {
		Z(pe, "data-workflow-data", t.model.kind), q(he, `Uses ${(t.model.name || t.model.targetId) ?? ""}`), ge.open = t.model.kind === "clock", q(ve, `${t.model.kind === "clock" ? "Starting values" : t.model.kind === "outcomes" ? "Initial outcomes" : "Initial content"} `), q(be, e), q(ke, `${a ?? ""} · ${o ?? ""}`), q(Pe, H(w)), Z(ze, "aria-label", "Create separate " + H(T)), Z(ze, "title", "Create separate " + H(T)), ze.disabled = r() || !t.model.editable || !t.model.available || !n().createWorkflowData || !!H(_), q(Ge, t.model.kind === "clock" ? "Same clock: shared time. Different clocks: independent time." : t.model.kind === "outcomes" ? "Shared by nodes using these outcomes." : "Shared by nodes using this document."), Z(Ye, "id", i() + "-visibility"), Z(Xe, "aria-labelledby", i() + "-visibility"), Z(nt, "aria-label", H(w) + " document ID"), wi(nt, t.model.targetId), st.disabled = !H(se), q(ct, H(_) === "save" ? "Saving…" : "Save settings");
	}, [
		() => t.model.kind === "clock" && H(a) ? "Day " + H(o) + " · " + H(s) : H(a) && !H(u).trim() ? "Empty by default" : H(a) ? t.model.kind === "outcomes" && H(u).trim() === "[]" ? "None" : "Initial template" : "Load initial values to edit",
		() => A(H(d)),
		() => j(H(f))
	]), W("click", ze, () => {
		!r() && t.model.editable && t.model.available && !H(_) && (L(h, !H(h)), L(g, ""), L(v, ""));
	}), W("click", st, le), K(e, pe), We();
}
Er([
	"click",
	"input",
	"change"
]);
//#endregion
//#region ui/NodeDetails.svelte
var Ac = /* @__PURE__ */ G("<small data-canonical-title=\"\" class=\"svelte-59ntjv\"> </small>"), jc = /* @__PURE__ */ G("<button type=\"button\" class=\"pc-node-guide-help svelte-59ntjv\">?</button>"), Mc = /* @__PURE__ */ G("<div class=\"pc-detail-error svelte-59ntjv\"><!></div>"), Nc = /* @__PURE__ */ G("<label class=\"svelte-59ntjv\">Workflow stage<select aria-label=\"Workflow stage\" class=\"svelte-59ntjv\"><option class=\"svelte-59ntjv\">Preparation · before Generate Reply</option><option class=\"svelte-59ntjv\">Response · after Generate Reply</option></select></label><!>", 1), Pc = /* @__PURE__ */ G("<span class=\"svelte-59ntjv\">Read-only body</span>"), Fc = /* @__PURE__ */ G("<span class=\"pc-detail-blocked svelte-59ntjv\"> </span>"), Ic = /* @__PURE__ */ G("<p class=\"pc-detail-state svelte-59ntjv\"><!><!></p>"), Lc = /* @__PURE__ */ G("<label class=\"svelte-59ntjv\"><input type=\"checkbox\" aria-label=\"Run this system\" class=\"svelte-59ntjv\"/> Run this system</label><small class=\"svelte-59ntjv\">When off, the whole system and its outputs are skipped. Optional Guidance sections can omit it.</small><!>", 1), Rc = /* @__PURE__ */ G("<option class=\"svelte-59ntjv\"> </option>"), zc = /* @__PURE__ */ G("<fieldset class=\"pc-detail-group svelte-59ntjv\" data-boundary-controls=\"\"><legend class=\"svelte-59ntjv\"> </legend> <label class=\"svelte-59ntjv\">Type<select aria-label=\"Subgraph port type\" class=\"svelte-59ntjv\"></select></label> <label class=\"pc-detail-check svelte-59ntjv\"><input aria-label=\"Required subgraph port\" type=\"checkbox\" class=\"svelte-59ntjv\"/> Required</label> <div class=\"pc-detail-actions svelte-59ntjv\"><button type=\"button\" data-save-boundary=\"\" class=\"svelte-59ntjv\"> </button></div> <small class=\"svelte-59ntjv\">Labels appear on the subgraph block. Disconnect incompatible connections before changing the type. Deleting this node removes its port and attached connections.</small> <!></fieldset>"), Bc = /* @__PURE__ */ G("<p role=\"status\" class=\"svelte-59ntjv\">Loading file…</p>"), Vc = /* @__PURE__ */ G("<div data-file-input-controls=\"\" class=\"svelte-59ntjv\"><label class=\"svelte-59ntjv\"> <input type=\"file\" accept=\".txt,.md,.json,text/plain,text/markdown,application/json\" class=\"svelte-59ntjv\"/></label> <p class=\"svelte-59ntjv\"> </p> <small class=\"svelte-59ntjv\">The file's UTF-8 text is embedded in this workflow. Runs use the saved snapshot; replace the file to refresh it.</small> <small class=\"svelte-59ntjv\">Choose a .txt, .md or .json file up to 400,000 bytes and 100,000 UTF-16 code units.</small> <!> <!></div>"), Hc = /* @__PURE__ */ G("<details class=\"pc-detail-group svelte-59ntjv\"><summary class=\"svelte-59ntjv\"> </summary> <!></details>"), Uc = /* @__PURE__ */ G("<!> <fieldset class=\"pc-detail-group pc-detail-main svelte-59ntjv\" data-operation-controls=\"\"><!> <!></fieldset> <!>", 1), Wc = /* @__PURE__ */ G("<label class=\"svelte-59ntjv\">Model identifier<input class=\"svelte-59ntjv\"/></label>"), Gc = /* @__PURE__ */ G("<small class=\"svelte-59ntjv\"> </small>"), Kc = /* @__PURE__ */ G("<fieldset class=\"svelte-59ntjv\"><legend class=\"svelte-59ntjv\"> </legend> <label class=\"svelte-59ntjv\">Connection profile<select class=\"svelte-59ntjv\"><option class=\"svelte-59ntjv\">Use helper connection</option><!><!></select></label> <label class=\"svelte-59ntjv\">Model mode<select class=\"svelte-59ntjv\"></select></label> <!> <small class=\"svelte-59ntjv\"> </small><small class=\"svelte-59ntjv\"> </small><!> <!></fieldset>"), qc = /* @__PURE__ */ G("<small class=\"svelte-59ntjv\">This helper has no text model calls to configure.</small>"), Jc = /* @__PURE__ */ G("<details class=\"pc-detail-group svelte-59ntjv\" data-helper-model-controls=\"\" open=\"\"><summary class=\"svelte-59ntjv\">Helper model bindings</summary> <small class=\"svelte-59ntjv\">Choose connections for inherited text model roles in the pinned helper. Explicit helper-node bindings take precedence. These selections belong to this For Each node.</small> <!> <!></details>"), Yc = /* @__PURE__ */ G("<label class=\"svelte-59ntjv\">Model identifier<input aria-label=\"Model identifier\" class=\"svelte-59ntjv\"/></label>"), Xc = /* @__PURE__ */ G("<!> <details class=\"pc-detail-group svelte-59ntjv\" data-model-controls=\"\"><summary class=\"svelte-59ntjv\">Advanced model settings</summary> <button type=\"button\" data-reset-profile=\"\" class=\"svelte-59ntjv\"> </button> <small class=\"svelte-59ntjv\">Choose a connection with the bar under this node. Reset removes this node's connection override.</small> <label class=\"svelte-59ntjv\">Model mode<select aria-label=\"Model mode\" class=\"svelte-59ntjv\"></select></label> <!> <label class=\"svelte-59ntjv\">Model role<input aria-label=\"Model role\" class=\"svelte-59ntjv\"/></label> <!><!> <!></details>", 1), Zc = /* @__PURE__ */ G("<p class=\"pc-detail-port svelte-59ntjv\"> <small class=\"svelte-59ntjv\"> </small></p>"), Qc = /* @__PURE__ */ G("<details class=\"pc-detail-group svelte-59ntjv\"><summary class=\"svelte-59ntjv\">Inputs and outputs</summary><!></details>"), $c = /* @__PURE__ */ G("<p role=\"status\" class=\"svelte-59ntjv\"> </p>"), el = /* @__PURE__ */ G("<header class=\"svelte-59ntjv\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" class=\"svelte-59ntjv\"><path class=\"svelte-59ntjv\"></path></svg> <div class=\"pc-detail-identity svelte-59ntjv\"><input class=\"pc-detail-name svelte-59ntjv\" aria-label=\"Node name\"/> <!> <small class=\"svelte-59ntjv\"> </small></div> <!></header> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!>", 1), tl = /* @__PURE__ */ G("<p class=\"pc-detail-empty svelte-59ntjv\">Select a node to inspect its settings.</p>"), nl = /* @__PURE__ */ G("<section class=\"pc-node-details svelte-59ntjv\" aria-label=\"Node details\"><!></section>");
function rl(e, t) {
	Ue(t, !0);
	let n = (e, n = d) => {
		{
			let s = /* @__PURE__ */ F(() => H(a)[n().key]?.text ?? k(n())), c = /* @__PURE__ */ F(() => H(a)[n().key]?.error || H(o)[n().key] || ""), l = /* @__PURE__ */ F(() => !!t.view?.readOnly || !r().editControl), u = /* @__PURE__ */ F(() => !!H(a)[n().key]?.pending), d = /* @__PURE__ */ F(() => i() + "-" + n().key), f = /* @__PURE__ */ F(() => H(a)[n().key]?.typedValue);
			Vs(e, {
				get control() {
					return n();
				},
				get text() {
					return H(s);
				},
				get error() {
					return H(c);
				},
				get disabled() {
					return H(l);
				},
				get pending() {
					return H(u);
				},
				get idPrefix() {
					return H(d);
				},
				get draftValue() {
					return H(f);
				},
				onDraft: (e) => ne(n(), e),
				ontext: (e) => te(n(), e),
				onvalue: (e) => ie(n(), e),
				onnumber: (e) => ae(n(), e),
				onsave: () => re(n())
			});
		}
	}, r = Pi(t, "actions", 19, () => ({})), i = Pi(t, "idPrefix", 3, "pc-node-details"), a = /* @__PURE__ */ I(tn({})), o = /* @__PURE__ */ I(tn({})), s = "", c = "", l = "", u = 0, f = 0, p = 0, h = /* @__PURE__ */ new Map(), g = /* @__PURE__ */ I(!1), _ = 0, v = 0, y = 0, b = /* @__PURE__ */ new Map(), x = /* @__PURE__ */ new Map(), S = /* @__PURE__ */ new Map(), C = (e) => Object.fromEntries(Object.entries(e).map(([e, t]) => [e, {
		...t,
		pending: !1
	}]));
	function w(e, t) {
		return t ? Object.fromEntries(Object.entries(C(e)).flatMap(([e, n]) => {
			if (e.startsWith("[\"helper-binding\",")) {
				let r = JSON.parse(e);
				return t.helperBindings?.roles.find((e) => e.role === r[1]) && r[2] === "model" && t.helperBindings?.editable && n.helperKey === t.helperBindings.helperKey ? [[e, n]] : [];
			}
			if (e === "model") return (t.model?.model)?.allowedModes.some((e) => e.value === "override") ? [[e, n]] : [];
			if (e === "boundary") return t.boundary && n.boundaryId === t.boundary.id && n.boundaryDirection === t.boundary.direction ? [[e, {
				...n,
				artifactKind: t.boundary.kinds.includes(n.artifactKind ?? "") ? n.artifactKind : t.boundary.kind
			}]] : [];
			if (e === "fileInput") return t.fileInput ? [[e, n]] : [];
			if (e.startsWith("modifier:")) {
				let r = t.modifiers?.items.find((t) => "modifier:" + t.id === e);
				return r && r.type === n.modifierType && t.modifiers?.options.some((e) => e.type === r.type) ? [[e, n]] : [];
			}
			return t.controls.some((t) => t.key === e && t.editor === n.editor && t.representation === n.representation && (t.editor === "json" || t.editor === "lines")) ? [[e, n]] : [];
		})) : {};
	}
	let T = (e) => JSON.stringify([
		e.documentNamespace ?? "",
		e.selectionKey,
		"kind" in e.address ? [
			e.address.kind,
			e.address.definitionRef.id,
			e.address.definitionRef.version,
			e.address.definitionRef.semanticHash,
			e.address.nodeId
		] : [
			e.address.workflowId,
			e.address.instancePath,
			e.address.nodeId
		]
	]), E = !0;
	Ii(() => {
		E = !1, h.clear(), S.clear(), x.clear(), b.clear();
	}), Cn(() => {
		let e = t.view ? T(t.view) : "", n = t.view?.revision ?? "", r = t.view?.editorContractKey ?? JSON.stringify([
			t.view?.controls.map((e) => [
				e.key,
				e.editor,
				e.representation,
				e.allowEmpty,
				e.structured
			]),
			t.view?.model?.profile.allowedModes,
			t.view?.model?.model.allowedModes,
			t.view?.model?.editable,
			t.view?.helperBindings && [
				t.view.helperBindings.helperKey,
				t.view.helperBindings.editable,
				t.view.helperBindings.roles.map((e) => [e.role, e.model.allowedModes])
			],
			t.view?.boundary && [
				t.view.boundary.id,
				t.view.boundary.direction,
				t.view.boundary.kinds
			],
			!!t.view?.fileInput,
			t.view?.modifiers && [
				t.view.modifiers.items.map((e) => [e.id, e.type]).sort(([e], [t]) => e.localeCompare(t)),
				t.view.modifiers.options.map((e) => [e.type, e.fields.map((e) => [e.key, e.editor])]),
				t.view.modifiers.editable,
				t.view.readOnly
			]
		]), i = e !== s;
		if (i || n !== c || r !== l) {
			(i || r !== l) && (f++, y++), i && (p++, s && S.set(s, {
				contract: l,
				drafts: _r(() => C(H(a)))
			}));
			let d = !i && r !== l, m = S.get(e), _ = d || !!m && m.contract !== r, b = i ? m?.drafts ?? {} : _r(() => H(a));
			_ && (S.delete(e), b = b.boundary ? w({ boundary: b.boundary }, t.view) : {}, b.boundary && j("boundary")), s = e, c = n, l = r, h.clear(), u++, L(o, {}, !0), L(g, !1), v++, L(a, w(b, t.view), !0);
		}
	});
	let D = (e) => ({
		...e.documentNamespace ? { documentNamespace: e.documentNamespace } : {},
		selectionKey: e.selectionKey,
		revision: e.revision,
		address: "kind" in e.address ? {
			...e.address,
			definitionRef: { ...e.address.definitionRef }
		} : {
			...e.address,
			instancePath: [...e.address.instancePath]
		}
	}), O = (e) => E && !!t.view && t.view.selectionKey === e.selectionKey && t.view.revision === e.revision && T(t.view) === T(e);
	function k(e) {
		return e.editor === "json" ? e.representation === "json-text" ? String(e.value ?? "") : JSON.stringify(e.value, null, 2) : e.editor === "lines" && Array.isArray(e.value) ? e.value.join("\n") : String(e.value ?? "");
	}
	function A(e, t) {
		if (e.editorContractKey) return e.editorContractKey + ":" + t;
		if (t.startsWith("[\"helper-binding\",")) {
			let n = JSON.parse(t);
			return e.helperBindings?.editable && e.helperBindings.roles.some((e) => e.role === n[1]) ? JSON.stringify([
				"helper-binding",
				e.helperBindings.helperKey,
				n[1],
				n[2]
			]) : null;
		}
		if (t === "model") return (e.model?.model)?.allowedModes.some((e) => e.value === "override") ? JSON.stringify([
			"binding",
			t,
			e.model?.editable ?? !e.readOnly
		]) : null;
		let n = e.controls.find((e) => e.key === t);
		return n && (n.editor === "json" || n.editor === "lines") ? JSON.stringify([
			n.editor,
			n.representation,
			n.allowEmpty,
			n.structured
		]) : null;
	}
	function j(e) {
		let t = (x.get(e) ?? 0) + 1;
		return x.set(e, t), t;
	}
	async function M(e, n, r) {
		let i = t.view;
		if (!i || (n ? !i.canPresent : e === "profileId" || e === "model" ? !_e(i) : i.readOnly)) return;
		let s = D(i), c = ++u, l = p, d = A(i, e), f = H(a)[e] && d ? j(e) : null;
		h.set(e, c), L(o, {
			...H(o),
			[e]: ""
		}, !0), H(a)[e] && L(a, {
			...H(a),
			[e]: {
				...H(a)[e],
				pending: !0,
				error: ""
			}
		}, !0);
		let m = "", g = !1;
		try {
			let e = await r(s);
			g = e.ok, e.ok || (m = e.error.code + ": " + e.error.message);
		} catch {
			m = "The edit could not be accepted. Check the current settings before trying the edit again.";
		}
		if (g && f !== null && H(a)[e] && E && t.view && p === l && T(t.view) === T(s) && x.get(e) === f && A(t.view, e) === d) {
			let t = { ...H(a) };
			delete t[e], L(a, t, !0);
		}
		if (O(s) && h.get(e) === c && (h.delete(e), L(o, {
			...H(o),
			[e]: m
		}, !0), H(a)[e])) {
			if (m) L(a, {
				...H(a),
				[e]: {
					...H(a)[e],
					error: m,
					pending: !1
				}
			}, !0);
			else {
				let t = { ...H(a) };
				delete t[e], L(a, t, !0);
			}
		}
	}
	function ee(e) {
		let n = e.files?.[0];
		e.value = "", n && t.view?.fileInput && !t.view.readOnly && r().loadFile && !H(a).fileInput?.pending && (L(a, {
			...H(a),
			fileInput: {
				text: "",
				error: "",
				pending: !1
			}
		}, !0), M("fileInput", !1, (e) => r().loadFile(e, n)));
	}
	function te(e, n) {
		t.view && !t.view.readOnly && (j(e.key), h.delete(e.key), L(a, {
			...H(a),
			[e.key]: {
				text: n,
				error: "",
				pending: !1,
				editor: e.editor,
				representation: e.representation
			}
		}, !0), L(o, {
			...H(o),
			[e.key]: ""
		}, !0));
	}
	function ne(e, n) {
		t.view && !t.view.readOnly && (j(e.key), h.delete(e.key), L(a, {
			...H(a),
			[e.key]: {
				text: "",
				typedValue: n,
				error: "",
				pending: !1,
				editor: e.editor,
				representation: e.representation
			}
		}, !0), L(o, {
			...H(o),
			[e.key]: ""
		}, !0));
	}
	function re(e) {
		if (!t.view || t.view.readOnly || !r().editControl) return;
		if (e.structured && H(a)[e.key]?.typedValue !== void 0) {
			let t = ze(H(a)[e.key].typedValue);
			M(e.key, !1, (n) => r().editControl(n, e.key, t));
			return;
		}
		let n = H(a)[e.key]?.text ?? k(e), i = n;
		if (e.editor === "json") try {
			if (!(e.representation === "json-text" && e.allowEmpty && n.trim() === "")) {
				let t = JSON.parse(n);
				e.representation !== "json-text" && (i = t);
			}
		} catch {
			L(a, {
				...H(a),
				[e.key]: {
					text: n,
					error: "Enter valid JSON before saving.",
					pending: !1,
					editor: e.editor,
					representation: e.representation
				}
			}, !0);
			return;
		}
		else e.editor === "lines" && (i = n.split("\n").filter((e) => e.trim()));
		M(e.key, !1, (t) => r().editControl(t, e.key, i));
	}
	function ie(e, t) {
		r().editControl && M(e.key, !1, (n) => r().editControl(n, e.key, t));
	}
	function ae(e, n) {
		if (!t.view || t.view.readOnly || !r().editControl) return;
		let i = Number(n.value);
		!n.value.trim() || !Number.isFinite(i) ? L(o, {
			...H(o),
			[e.key]: "Enter a finite number before saving."
		}, !0) : n.validity.valid ? ie(e, i) : L(o, {
			...H(o),
			[e.key]: "Enter a number within the allowed range and step."
		}, !0);
	}
	let oe = (e, t) => JSON.stringify([
		"helper-binding",
		e,
		t
	]), se = (e) => t.view?.helperBindings?.roles.find((t) => t.role === e), ce = () => !!t.view?.helperBindings?.editable && !t.view.readOnly && !!r().editHelperBinding, le = (e, t) => ce() && se(e)?.[t === "profileId" ? "profile" : "model"].editable !== !1, ue = (e) => H(a)[oe(e, "model")] ? "override" : se(e)?.model.mode;
	function de(e, t, n, i) {
		le(e, t) && se(e) && M(oe(e, t), !1, (a) => r().editHelperBinding(a, e, t, n, i));
	}
	function fe(e, n) {
		if (!le(e, "model") || !se(e)) return;
		let r = oe(e, "model");
		j(r), h.delete(r), L(a, {
			...H(a),
			[r]: {
				text: n,
				error: "",
				pending: !1,
				helperKey: t.view?.helperBindings?.helperKey
			}
		}, !0), L(o, {
			...H(o),
			[r]: ""
		}, !0);
	}
	function pe(e, t) {
		let n = se(e);
		if (!le(e, "model") || !n?.model.allowedModes.some((e) => e.value === t)) return;
		let r = oe(e, "model");
		if (t === "override") {
			fe(e, H(a)[r]?.text ?? n.model.value ?? "");
			return;
		}
		h.delete(r);
		let i = { ...H(a) };
		delete i[r], L(a, i, !0), L(o, {
			...H(o),
			[r]: ""
		}, !0), t !== n.model.mode && de(e, "model", t, null);
	}
	function me(e, t) {
		if (!le(e, "model") || ue(e) !== "override") return;
		fe(e, t);
		let n = oe(e, "model");
		!t.trim() || t.length > 256 ? L(o, {
			...H(o),
			[n]: "Enter a model identifier of 1–256 characters."
		}, !0) : de(e, "model", "override", t);
	}
	function he(e, t, n) {
		ge(e)?.allowedModes.some((e) => e.value === t) && r().editBinding && M(e, !1, (i) => r().editBinding(i, e, t, n));
	}
	let ge = (e) => e === "profileId" ? t.view?.model?.profile : t.view?.model?.model, _e = (e = t.view) => !!e?.model && (e.model.editable ?? !e.readOnly) && !!r().editBinding, ve = (e) => H(a)[e] ? "override" : ge(e)?.mode, ye = (e) => H(a)[e]?.text ?? ge(e)?.value ?? "", be = () => t.view?.model?.profile.mode === "override" || !!t.view?.model?.profileDefaultModel;
	function xe(e, t) {
		_e() && ge(e)?.allowedModes.some((e) => e.value === "override") && (j(e), h.delete(e), L(a, {
			...H(a),
			[e]: {
				text: t,
				error: "",
				pending: !1
			}
		}, !0), L(o, {
			...H(o),
			[e]: ""
		}, !0));
	}
	function Se(e, t) {
		let n = ge(e);
		if (!_e() || !n?.allowedModes.some((e) => e.value === t)) return;
		if (t === "override") {
			xe(e, ye(e));
			return;
		}
		h.delete(e);
		let r = { ...H(a) };
		delete r[e], L(a, r, !0), L(o, {
			...H(o),
			[e]: ""
		}, !0), t !== n.mode && he(e, t, null);
	}
	function Ce(e, n) {
		if (_e() && (e !== "model" || ve(e) === "override") && ge(e)?.allowedModes.some((e) => e.value === "override")) {
			if (xe(e, n), !n.trim()) {
				let r = t.view?.readOnly ? "block" : "inherit";
				if (e === "model" && be() && ge(e)?.allowedModes.some((e) => e.value === r)) {
					Se(e, r);
					return;
				}
				L(a, {
					...H(a),
					[e]: {
						text: n,
						error: "Enter a model identifier before saving an override.",
						pending: !1
					}
				}, !0);
			} else he(e, "override", n);
		}
	}
	let we = () => !!t.view?.modifiers?.editable && !t.view.readOnly && !!r().editModifiers, Te = () => JSON.parse(JSON.stringify(t.view?.modifiers?.items ?? []));
	function Ee(e) {
		let t = H(a)["modifier:" + e.id];
		if (t) try {
			return JSON.parse(t.text);
		} catch {}
		return e.settings;
	}
	let De = () => Object.fromEntries((t.view?.modifiers?.items ?? []).map((e) => {
		let t = H(a)["modifier:" + e.id];
		return [e.id, {
			settings: Ee(e),
			error: t?.error || H(o)["modifier:" + e.id] || "",
			pending: !!t?.pending,
			dirty: !!t
		}];
	}));
	function N(e) {
		if (!we() || H(g) || e.length > 16 || !r().editModifiers) return;
		let t = ++v;
		L(g, !0), M("modifiers", !1, (t) => r().editModifiers(t, e)).finally(() => {
			t === v && L(g, !1);
		});
	}
	function Oe(e) {
		if (!we() || !t.view?.modifiers || t.view.modifiers.items.length >= 16) return;
		let n = t.view.modifiers.options.find((t) => t.type === e);
		if (!n) return;
		let r = Te(), i;
		do
			i = `mod-${e.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 28)}-${Date.now().toString(36)}-${(++_).toString(36)}`;
		while (r.some((e) => e.id === i));
		N([...r, {
			id: i,
			type: e,
			version: 1,
			enabled: !0,
			settings: JSON.parse(JSON.stringify(n.defaultSettings))
		}]);
	}
	function ke(e, n) {
		if (!we() || !t.view?.modifiers || !t.view.modifiers.options.some((t) => t.type === e)) return;
		let r = Te();
		r.some((t) => t.type === e) ? N(r.map((t) => t.type === e ? {
			...t,
			enabled: n
		} : t)) : n && Oe(e);
	}
	function Ae(e, n) {
		we() && t.view?.modifiers?.items.some((t) => t.id === e) && N(Te().map((t) => t.id === e ? {
			...t,
			enabled: n
		} : t));
	}
	function je(e) {
		we() && t.view?.modifiers?.items.some((t) => t.id === e) && N(Te().filter((t) => t.id !== e));
	}
	function Ne(e, t) {
		if (!we()) return;
		let n = Te(), r = n.findIndex((t) => t.id === e), i = r + t;
		r < 0 || i < 0 || i >= n.length || ([n[r], n[i]] = [n[i], n[r]], N(n));
	}
	function Pe(e, n, r) {
		if (!we()) return;
		let i = t.view?.modifiers?.items.find((t) => t.id === e), s = t.view?.modifiers?.options.find((e) => e.type === i?.type);
		if (!i || !s?.fields.some((e) => e.key === n)) return;
		let c = "modifier:" + e;
		b.set(c, (b.get(c) ?? 0) + 1), h.delete(c), L(o, {
			...H(o),
			[c]: ""
		}, !0), L(a, {
			...H(a),
			[c]: {
				text: JSON.stringify({
					...Ee(i),
					[n]: r
				}),
				error: "",
				pending: !1,
				modifierType: i.type
			}
		}, !0);
	}
	function Fe(e) {
		if (!we() || !r().editModifiers) return;
		let n = t.view?.modifiers?.items.find((t) => t.id === e), i = "modifier:" + e;
		if (!n || !H(a)[i] || H(a)[i].pending) return;
		let o = (b.get(i) ?? 0) + 1, s = y, c = n.type;
		b.set(i, o);
		let l = Ee(n), u = Te().map((t) => t.id === e ? {
			...t,
			settings: l
		} : t);
		M(i, !1, async (n) => {
			let l = await r().editModifiers(n, u);
			if (l.ok && E && t.view && T(t.view) === T(n) && y === s && b.get(i) === o && t.view.modifiers?.items.some((t) => t.id === e && t.type === c)) {
				let e = { ...H(a) };
				delete e[i], L(a, e, !0);
			}
			return l;
		});
	}
	let Ie = /* @__PURE__ */ F(() => {
		let e = /* @__PURE__ */ new Map();
		for (let n of t.view?.controls ?? []) {
			let t = n.group && n.group !== "Main" ? n.group : n.advanced ? "Advanced" : "Main";
			e.has(t) || e.set(t, []), e.get(t).push(n);
		}
		return [...e].sort(([e], [t]) => e === "Main" ? -1 : +(t === "Main"));
	}), Le = tn({}), Re = (e) => e.some((e) => !!(H(a)[e.key]?.error || H(o)[e.key]));
	function Be(e) {
		t.view && !t.view.boundary && r().present && M("alias", !0, (n) => r().present(n, "alias", e === t.view?.canonicalTitle ? "" : e));
	}
	function Ve() {
		return {
			label: H(a).boundary?.text ?? t.view?.boundary?.label ?? "",
			artifactKind: H(a).boundary?.artifactKind ?? t.view?.boundary?.kind ?? "",
			required: H(a).boundary?.required ?? t.view?.boundary?.required ?? !1
		};
	}
	function He(e, n) {
		if (!t.view?.boundary || t.view.readOnly || !r().editInterface || e === "artifactKind" && !t.view.boundary.kinds.includes(String(n))) return;
		let i = {
			...Ve(),
			[e]: n
		};
		f++, h.delete("boundary"), L(o, {
			...H(o),
			boundary: ""
		}, !0), L(a, {
			...H(a),
			boundary: {
				text: String(i.label),
				artifactKind: String(i.artifactKind),
				required: i.required === !0,
				error: "",
				pending: !1,
				boundaryId: t.view.boundary.id,
				boundaryDirection: t.view.boundary.direction
			}
		}, !0);
	}
	function Ge() {
		if (!t.view?.boundary || t.view.readOnly || !r().editInterface || H(a).boundary?.pending) return;
		let e = t.view.boundary.id, n = Ve();
		if (!n.label.trim() || !t.view.boundary.kinds.includes(n.artifactKind)) return;
		let i = ++f;
		L(a, {
			...H(a),
			boundary: {
				text: n.label,
				artifactKind: n.artifactKind,
				required: n.required,
				error: "",
				pending: !1,
				boundaryId: e,
				boundaryDirection: t.view.boundary.direction
			}
		}, !0), M("boundary", !1, async (o) => {
			let s = await r().editInterface(o, {
				kind: "update",
				id: e,
				...n
			});
			if (s.ok && E && t.view?.boundary?.id === e && T(t.view) === T(o) && f === i) {
				let e = { ...H(a) };
				delete e.boundary, L(a, e, !0);
			}
			return s;
		});
	}
	var Ke = nl(), qe = R(Ke), Je = (e) => {
		var s = el(), c = z(s);
		let l;
		var u = R(c), d = R(u);
		P(u);
		var f = B(u, 2), p = R(f);
		X(p);
		var h = B(p, 2), _ = (e) => {
			var n = Ac(), r = R(n);
			P(n), V(() => q(r, `Canonical type: ${t.view.canonicalTitle ?? ""}`)), K(e, n);
		};
		J(h, (e) => {
			!t.view.boundary && (t.view.alias || t.view.title || t.view.canonicalTitle) !== t.view.canonicalTitle && e(_);
		});
		var v = B(h, 2), y = R(v, !0);
		P(v), P(f);
		var b = B(f, 2), x = (e) => {
			var n = jc();
			V(() => {
				Z(n, "aria-label", `Open ${t.view.canonicalTitle} guide`), Z(n, "title", `Help with ${t.view.canonicalTitle}`);
			}), W("click", n, function(...e) {
				t.openGuide?.apply(this, e);
			}), K(e, n);
		};
		J(b, (e) => {
			t.openGuide && e(x);
		}), P(c);
		var S = B(c, 2), C = (e) => {
			var n = Nc(), i = z(n), a = B(R(i)), s = R(a);
			s.value = s.__value = "pre";
			var c = B(s);
			c.value = c.__value = "post", P(a);
			var l;
			_i(a), P(i);
			var u = B(i), d = (e) => {
				var n = Mc(), r = R(n);
				{
					let e = /* @__PURE__ */ F(() => ({ nodeTitle: t.view?.title }));
					go(r, {
						get issue() {
							return H(o).phase;
						},
						get context() {
							return H(e);
						}
					});
				}
				P(n), K(e, n);
			};
			J(u, (e) => {
				H(o).phase && e(d);
			}), V(() => {
				a.disabled = t.view.readOnly || !r().editPhase, l !== (l = t.view.phase) && (a.value = (a.__value = t.view.phase) ?? "", gi(a, t.view.phase));
			}), W("change", a, (e) => {
				let t = e.currentTarget.value;
				M("phase", !1, (e) => r().editPhase(e, t));
			}), K(e, n);
		};
		J(S, (e) => {
			t.view.phaseEditable && e(C);
		});
		var w = B(S, 2), T = (e) => {
			{
				let n = /* @__PURE__ */ F(() => ({
					queue: () => r().queueRecall?.(D(t.view)) ?? {
						ok: !1,
						error: {
							code: "RECALL_UNAVAILABLE",
							message: "Memory recall is unavailable."
						}
					},
					cancel: () => r().cancelRecall?.(D(t.view)) ?? {
						ok: !1,
						error: {
							code: "RECALL_UNAVAILABLE",
							message: "Memory recall is unavailable."
						}
					},
					revealShortcut: r().revealRecallShortcut
				}));
				qs(e, {
					get view() {
						return t.view.recall;
					},
					get actions() {
						return H(n);
					}
				});
			}
		};
		J(w, (e) => {
			t.view.recall && e(T);
		});
		var E = B(w, 2), O = (e) => {
			var n = Ic(), r = R(n), i = (e) => {
				K(e, Pc());
			};
			J(r, (e) => {
				t.view.readOnly && e(i);
			});
			var a = B(r), o = (e) => {
				var n = Fc(), r = R(n, !0);
				P(n), V(() => q(r, t.view.system ? "System skipped" : "Blocks run · Disabled")), K(e, n);
			};
			J(a, (e) => {
				t.view.enabled || e(o);
			}), P(n), K(e, n);
		};
		J(E, (e) => {
			(t.view.readOnly || !t.view.enabled) && e(O);
		});
		var k = B(E, 2), A = (e) => {
			var n = Lc(), i = z(n), a = R(i);
			X(a), Me(), P(i);
			var s = B(i, 2), c = (e) => {
				var n = Mc(), r = R(n);
				{
					let e = /* @__PURE__ */ F(() => ({ nodeTitle: t.view?.title }));
					go(r, {
						get issue() {
							return H(o).enabled;
						},
						get context() {
							return H(e);
						}
					});
				}
				P(n), K(e, n);
			};
			J(s, (e) => {
				H(o).enabled && e(c);
			}), V(() => {
				Ti(a, t.view.enabled), a.disabled = t.view.readOnly || !r().editField;
			}), W("change", a, (e) => {
				let t = e.currentTarget.checked;
				M("enabled", !1, (e) => r().editField(e, "enabled", t));
			}), K(e, n);
		};
		J(k, (e) => {
			t.view.system && e(A);
		});
		var j = B(k, 2), te = (e) => {
			var n = Mc(), r = R(n);
			{
				let e = /* @__PURE__ */ F(() => ({ nodeTitle: t.view?.title }));
				go(r, {
					get issue() {
						return H(o).alias;
					},
					get context() {
						return H(e);
					}
				});
			}
			P(n), K(e, n);
		};
		J(j, (e) => {
			H(o).alias && e(te);
		});
		var ne = B(j, 2), re = (e) => {
			var n = zc(), i = R(n), s = R(i);
			P(i);
			var c = B(i, 2), l = B(R(c));
			Y(l, 20, () => t.view.boundary.kinds, (e) => e, (e, t) => {
				var n = Rc(), r = R(n, !0);
				P(n);
				var i = {};
				V(() => {
					q(r, t), i !== (i = t) && (n.value = (n.__value = t) ?? "");
				}), K(e, n);
			}), P(l);
			var u;
			_i(l), P(c);
			var d = B(c, 2), f = R(d);
			X(f), Me(), P(d);
			var p = B(d, 2), m = R(p), h = R(m, !0);
			P(m), P(p);
			var g = B(p, 4), _ = (e) => {
				var n = Mc(), r = R(n);
				{
					let e = /* @__PURE__ */ F(() => H(a).boundary?.error || H(o).boundary), n = /* @__PURE__ */ F(() => ({ nodeTitle: t.view?.title }));
					go(r, {
						get issue() {
							return H(e);
						},
						get context() {
							return H(n);
						}
					});
				}
				P(n), K(e, n);
			};
			J(g, (e) => {
				(H(a).boundary?.error || H(o).boundary) && e(_);
			}), P(n), V((e, n, i) => {
				q(s, `Subgraph ${t.view.boundary.direction ?? ""}`), l.disabled = t.view.readOnly || !r().editInterface, u !== (u = e) && (l.value = (l.__value = e) ?? "", gi(l, e)), Ti(f, n), f.disabled = t.view.readOnly || !r().editInterface, m.disabled = i, q(h, H(a).boundary?.pending ? "Validating…" : "Save port");
			}, [
				() => Ve().artifactKind,
				() => Ve().required,
				() => t.view.readOnly || !r().editInterface || !Ve().label.trim() || !!H(a).boundary?.pending
			]), W("change", l, (e) => He("artifactKind", e.currentTarget.value)), W("change", f, (e) => He("required", e.currentTarget.checked)), W("click", m, () => Ge()), K(e, n);
		};
		J(ne, (e) => {
			t.view.boundary && e(re);
		});
		var ie = B(ne, 2), ae = (e) => {
			var s = Uc(), c = z(s), l = (e) => {
				{
					let n = /* @__PURE__ */ F(() => D(t.view)), a = /* @__PURE__ */ F(() => i() + "-workflow-data");
					kc(e, {
						get model() {
							return t.view.workflowData;
						},
						get selection() {
							return H(n);
						},
						get actions() {
							return r();
						},
						get disabled() {
							return t.view.readOnly;
						},
						get idPrefix() {
							return H(a);
						}
					});
				}
			};
			J(c, (e) => {
				t.view.workflowData && e(l);
			});
			var u = B(c, 2), d = R(u), f = (e) => {
				var n = Vc(), s = R(n), c = R(s, !0), l = B(c);
				P(s);
				var u = B(s, 2), d = R(u, !0);
				P(u);
				var f = B(u, 6), p = (e) => {
					K(e, Bc());
				};
				J(f, (e) => {
					H(a).fileInput?.pending && e(p);
				});
				var m = B(f, 2), h = (e) => {
					var n = Mc(), r = R(n);
					{
						let e = /* @__PURE__ */ F(() => ({ nodeTitle: t.view?.title }));
						go(r, {
							get issue() {
								return H(o).fileInput;
							},
							get context() {
								return H(e);
							}
						});
					}
					P(n), V(() => Z(n, "id", i() + "-error-fileInput")), K(e, n);
				};
				J(m, (e) => {
					H(o).fileInput && e(h);
				}), P(n), V(() => {
					q(c, t.view.fileInput.loaded ? "Replace file" : "Choose file"), Z(l, "aria-label", t.view.fileInput.loaded ? "Replace file" : "Choose file"), l.disabled = t.view.readOnly || !r().loadFile || !!H(a).fileInput?.pending, Z(l, "aria-invalid", !!H(o).fileInput), Z(l, "aria-describedby", H(o).fileInput ? i() + "-error-fileInput" : void 0), q(d, t.view.fileInput.loaded ? "Loaded file: " + t.view.fileInput.fileName : "No file loaded.");
				}), W("change", l, (e) => ee(e.currentTarget)), K(e, n);
			};
			J(d, (e) => {
				t.view.fileInput && e(f);
			}), Y(B(d, 2), 17, () => H(Ie).filter(([e]) => e === "Main"), ([e, t]) => e, (e, t) => {
				var r = /* @__PURE__ */ F(() => m(H(t), 2));
				let i = () => H(r)[1];
				var a = Lr();
				Y(z(a), 17, i, (e) => e.key, (e, t) => {
					n(e, () => H(t));
				}), K(e, a);
			}), P(u), Y(B(u, 2), 17, () => H(Ie).filter(([e]) => e !== "Main"), ([e, t]) => e, (e, t) => {
				var r = /* @__PURE__ */ F(() => m(H(t), 2));
				let i = () => H(r)[0], a = () => H(r)[1];
				var o = Hc(), s = R(o), c = R(s, !0);
				P(s);
				var l = B(s, 2), u = (e) => {
					var t = Lr();
					Y(z(t), 17, a, (e) => e.key, (e, t) => {
						n(e, () => H(t));
					}), K(e, t);
				}, d = /* @__PURE__ */ F(() => Le[i()] || Re(a()));
				J(l, (e) => {
					H(d) && e(u);
				}), P(o), V((e) => {
					Z(o, "data-control-group", i()), o.open = e, q(c, i());
				}, [() => Re(a())]), W("click", s, () => {
					Le[i()] = !0;
				}), K(e, o);
			}), K(e, s);
		};
		J(ie, (e) => {
			t.view.boundary || e(ae);
		});
		var se = B(ie, 2), ce = (e) => {
			var n = Jc(), r = B(R(n), 4);
			Y(r, 17, () => t.view.helperBindings.roles, (e) => e.role, (e, n) => {
				var r = Kc(), i = R(r), s = R(i, !0);
				P(i);
				var c = B(i, 2), l = B(R(c)), u = R(l);
				u.value = u.__value = "";
				var d = B(u), f = (e) => {
					var t = Rc(), r = R(t);
					P(t);
					var i = {};
					V(() => {
						q(r, `Unavailable connection · ${H(n).profile.value ?? ""}`), i !== (i = H(n).profile.value) && (t.value = (t.__value = H(n).profile.value) ?? "");
					}), K(e, t);
				}, p = /* @__PURE__ */ F(() => H(n).profile.value && !(H(n).profile.options ?? []).some((e) => e.value === H(n).profile.value));
				J(d, (e) => {
					H(p) && e(f);
				}), Y(B(d), 17, () => H(n).profile.options ?? [], (e) => e.value, (e, t) => {
					var n = Rc(), r = R(n, !0);
					P(n);
					var i = {};
					V(() => {
						q(r, H(t).label), i !== (i = H(t).value) && (n.value = (n.__value = H(t).value) ?? "");
					}), K(e, n);
				}), P(l);
				var m;
				_i(l), P(c);
				var h = B(c, 2), g = B(R(h));
				Y(g, 21, () => H(n).model.allowedModes, (e) => e.value, (e, t) => {
					var n = Rc(), r = R(n, !0);
					P(n);
					var i = {};
					V(() => {
						q(r, H(t).label), i !== (i = H(t).value) && (n.value = (n.__value = H(t).value) ?? "");
					}), K(e, n);
				}), P(g);
				var _;
				_i(g), P(h);
				var v = B(h, 2), y = (e) => {
					var t = Wc(), r = B(R(t));
					X(r), P(t), V((e, t) => {
						Z(r, "aria-label", H(n).role + " model identifier"), wi(r, e), r.disabled = t;
					}, [() => H(a)[oe(H(n).role, "model")]?.text ?? H(n).model.value ?? "", () => !le(H(n).role, "model")]), W("input", r, (e) => fe(H(n).role, e.currentTarget.value)), W("change", r, (e) => me(H(n).role, e.currentTarget.value)), K(e, t);
				}, b = /* @__PURE__ */ F(() => ue(H(n).role) === "override");
				J(v, (e) => {
					H(b) && e(y);
				});
				var x = B(v, 2), S = R(x);
				P(x);
				var C = B(x), w = R(C, !0);
				P(C);
				var T = B(C), E = (e) => {
					var t = Gc(), r = R(t, !0);
					P(t), V(() => q(r, H(n).caveat)), K(e, t);
				};
				J(T, (e) => {
					H(n).caveat && e(E);
				});
				var D = B(T, 2), O = (e) => {
					var r = Mc(), i = R(r);
					{
						let e = /* @__PURE__ */ F(() => H(o)[oe(H(n).role, "profileId")] || H(o)[oe(H(n).role, "model")]), r = /* @__PURE__ */ F(() => ({ nodeTitle: t.view?.title }));
						go(i, {
							get issue() {
								return H(e);
							},
							get context() {
								return H(r);
							}
						});
					}
					P(r), K(e, r);
				}, k = /* @__PURE__ */ F(() => H(o)[oe(H(n).role, "profileId")] || H(o)[oe(H(n).role, "model")]);
				J(D, (e) => {
					H(k) && e(O);
				}), P(r), V((e, t, r) => {
					q(s, H(n).label), Z(l, "aria-label", H(n).role + " connection profile"), l.disabled = e, m !== (m = H(n).profile.value ?? "") && (l.value = (l.__value = H(n).profile.value ?? "") ?? "", gi(l, H(n).profile.value ?? "")), Z(g, "aria-label", H(n).role + " model mode"), g.disabled = t, _ !== (_ = r) && (g.value = (g.__value = r) ?? "", gi(g, r)), q(S, `Effective connection: ${H(n).effective ?? ""}`), q(w, H(n).source);
				}, [
					() => !le(H(n).role, "profileId"),
					() => !le(H(n).role, "model"),
					() => ue(H(n).role)
				]), W("change", l, (e) => de(H(n).role, "profileId", e.currentTarget.value ? "override" : "inherit", e.currentTarget.value || null)), W("change", g, (e) => pe(H(n).role, e.currentTarget.value)), K(e, r);
			});
			var i = B(r, 2), s = (e) => {
				var n = Mc(), r = R(n);
				{
					let e = /* @__PURE__ */ F(() => ({ nodeTitle: t.view?.title }));
					go(r, {
						get diagnostic() {
							return t.view.helperBindings.issueDiagnostic;
						},
						get issue() {
							return t.view.helperBindings.issue;
						},
						get context() {
							return H(e);
						}
					});
				}
				P(n), K(e, n);
			}, c = (e) => {
				K(e, qc());
			};
			J(i, (e) => {
				t.view.helperBindings.issueDiagnostic || t.view.helperBindings.issue ? e(s) : t.view.helperBindings.roles.length || e(c, 1);
			}), P(n), K(e, n);
		};
		J(se, (e) => {
			t.view.helperBindings && e(ce);
		});
		var ge = B(se, 2), Te = (e) => {
			var n = Xc(), i = z(n), s = (e) => {
				var n = Mc(), r = R(n);
				{
					let e = /* @__PURE__ */ F(() => ({ nodeTitle: t.view?.title }));
					go(r, {
						get diagnostic() {
							return t.view.model.issueDiagnostic;
						},
						get issue() {
							return t.view.model.issue;
						},
						get context() {
							return H(e);
						}
					});
				}
				P(n), K(e, n);
			};
			J(i, (e) => {
				(t.view.model.issueDiagnostic || t.view.model.issue) && e(s);
			});
			var c = B(i, 2), l = B(R(c), 2), u = R(l, !0);
			P(l);
			var d = B(l, 4), f = B(R(d));
			Y(f, 21, () => t.view.model.model.allowedModes, (e) => e.value, (e, n) => {
				var r = Rc(), i = R(r, !0);
				P(r);
				var a = {};
				V((e) => {
					q(i, e), a !== (a = H(n).value) && (r.value = (r.__value = H(n).value) ?? "");
				}, [() => H(n).value === "inherit" && !t.view.readOnly ? be() || !t.view.model.model.effectiveValue ? "Use profile model" : "Existing role model" : H(n).label]), K(e, r);
			}), P(f);
			var p;
			_i(f), P(d);
			var m = B(d, 2), h = (e) => {
				var t = Yc(), n = B(R(t));
				X(n), P(t), V((e, t) => {
					wi(n, e), n.disabled = t;
				}, [() => ye("model"), () => !_e()]), W("input", n, (e) => xe("model", e.currentTarget.value)), W("change", n, (e) => Ce("model", e.currentTarget.value)), K(e, t);
			}, g = /* @__PURE__ */ F(() => ve("model") === "override");
			J(m, (e) => {
				H(g) && e(h);
			});
			var _ = B(m, 2), v = B(R(_));
			X(v), P(_);
			var y = B(_, 2), b = (e) => {
				var n = Gc(), r = R(n);
				P(n), V(() => q(r, `Effective connection: ${t.view.model.effective ?? ""}`)), K(e, n);
			}, x = /* @__PURE__ */ F(() => !t.view.model.issue || t.view.model.effective.trim() !== t.view.model.issue.trim());
			J(y, (e) => {
				H(x) && e(b);
			});
			var S = B(y), C = (e) => {
				var n = Gc(), r = R(n, !0);
				P(n), V(() => q(r, t.view.model.source)), K(e, n);
			};
			J(S, (e) => {
				t.view.model.source && e(C);
			});
			var w = B(S, 2), T = (e) => {
				var n = Mc(), r = R(n);
				{
					let e = /* @__PURE__ */ F(() => H(o).modelRole || H(o).profileId || H(a).model?.error || H(o).model), n = /* @__PURE__ */ F(() => ({ nodeTitle: t.view?.title }));
					go(r, {
						get issue() {
							return H(e);
						},
						get context() {
							return H(n);
						}
					});
				}
				P(n), K(e, n);
			};
			J(w, (e) => {
				(H(o).modelRole || H(o).profileId || H(a).model?.error || H(o).model) && e(T);
			}), P(c), V((e, n, i) => {
				l.disabled = e, q(u, t.view.readOnly ? "Use definition connection" : "Use inherited connection"), f.disabled = n, p !== (p = i) && (f.value = (f.__value = i) ?? "", gi(f, i)), wi(v, t.view.model.role), v.disabled = t.view.readOnly || !t.view.model.roleEditable || !r().editField;
			}, [
				() => !_e() || t.view.model.profile.mode === "inherit" || !t.view.model.profile.allowedModes.some((e) => e.value === "inherit"),
				() => !_e(),
				() => ve("model")
			]), W("click", l, () => he("profileId", "inherit", null)), W("change", f, (e) => Se("model", e.currentTarget.value)), W("change", v, (e) => {
				let n = e.currentTarget.value;
				t.view?.model?.roleEditable && r().editField && M("modelRole", !1, (e) => r().editField(e, "modelRole", n));
			}), K(e, n);
		};
		J(ge, (e) => {
			t.view.model && e(Te);
		});
		var Ee = B(ge, 2), N = (e) => {
			var n = Qc();
			Y(B(R(n)), 17, () => t.view.ports, (e) => e.direction + ":" + e.id, (e, t) => {
				var n = Zc(), r = R(n), i = B(r), a = R(i, !0);
				P(i), P(n), V(() => {
					q(r, `${H(t).direction === "input" ? "In" : "Out"} · ${H(t).label ?? ""}`), q(a, H(t).kind);
				}), K(e, n);
			}), P(n), K(e, n);
		};
		J(Ee, (e) => {
			t.view.ports.length && e(N);
		});
		var ze = B(Ee, 2), Ue = (e) => {
			var n = $c(), r = R(n, !0);
			P(n), V(() => q(r, t.view.status)), K(e, n);
		};
		J(ze, (e) => {
			t.view.status && e(Ue);
		});
		var We = B(ze, 2);
		Y(We, 17, () => lo((t.view.issues ?? []).filter((e) => e !== t.view?.model?.issue && e !== t.view?.helperBindings?.issue), { nodeTitle: t.view.title }), (e) => e.id, (e, t) => {
			var n = Mc();
			go(R(n), { get diagnostic() {
				return H(t);
			} }), P(n), K(e, n);
		});
		var Ke = B(We, 2), qe = (e) => {
			{
				let n = /* @__PURE__ */ F(() => !we()), r = /* @__PURE__ */ F(De), a = /* @__PURE__ */ F(() => H(o).modifiers || "");
				lc(e, {
					get items() {
						return t.view.modifiers.items;
					},
					get options() {
						return t.view.modifiers.options;
					},
					get disabled() {
						return H(n);
					},
					get busy() {
						return H(g);
					},
					get drafts() {
						return H(r);
					},
					get error() {
						return H(a);
					},
					get idPrefix() {
						return i();
					},
					onquick: ke,
					onadd: Oe,
					onenable: Ae,
					onremove: je,
					onmove: Ne,
					ondraft: Pe,
					onsave: Fe
				});
			}
		};
		J(Ke, (e) => {
			t.view.modifiers && e(qe);
		}), V((e) => {
			l = hi(c, "", l, { "--pc-detail-family": t.view.familyColor ?? "var(--pc-accent)" }), Z(d, "d", t.view.iconPath), Z(p, "id", i() + "-name"), Z(p, "maxlength", t.view.boundary ? void 0 : 80), wi(p, e), p.disabled = t.view.boundary ? t.view.readOnly || !r().editInterface : !t.view.canPresent || !r().present, q(y, t.view.boundary ? "Subgraph " + t.view.boundary.direction : t.view.family + " · " + t.view.phase + " phase");
		}, [() => t.view.boundary ? Ve().label : t.view.alias || t.view.title || t.view.canonicalTitle]), W("input", p, (e) => {
			t.view?.boundary && He("label", e.currentTarget.value);
		}), W("change", p, (e) => {
			t.view?.boundary || Be(e.currentTarget.value);
		}), K(e, s);
	}, Ye = (e) => {
		K(e, tl());
	};
	J(qe, (e) => {
		t.view ? e(Je) : e(Ye, -1);
	}), P(Ke), K(e, Ke), We();
}
Er([
	"input",
	"change",
	"click"
]);
//#endregion
//#region src/canvas/pin-alignment.js
var il = /* @__PURE__ */ new WeakMap();
function al(e, t) {
	let n = e.ownerDocument, r = n.createTreeWalker(e, 4), i = [];
	for (; r.nextNode();) i.push(r.currentNode);
	t && i.reverse();
	let a = n.createRange(), o, s = "";
	for (let e of i) {
		let n = e.textContent ?? "";
		for (let r = 0; r < n.length; r++) {
			let i = t ? n.length - 1 - r : r;
			a.setStart(e, i), a.setEnd(e, i + 1);
			let c = a.getBoundingClientRect();
			if (c.height) {
				if (o === void 0) o = c.top;
				else if (Math.abs(c.top - o) > .01) return s;
				s = t ? n[i] + s : s + n[i];
			}
		}
	}
	return s;
}
function ol(e, t = 1) {
	let n = e.ownerDocument, r = n.defaultView, i = Number.isFinite(t) && t > 0 ? t : 1;
	for (let t of e.querySelectorAll(".pc-native-row")) {
		let e = t.querySelector(".pc-native-pin-label"), a = t.querySelector(".pc-port");
		if (!e || !a) continue;
		let o = t.getBoundingClientRect(), s = e.getBoundingClientRect();
		if (!o.height || !s.height || r.getComputedStyle(e).display === "none") {
			a.style.setProperty("--pc-pin-y", "0px");
			continue;
		}
		if (!il.has(n)) {
			let e = null;
			try {
				e = n.createElement("canvas").getContext("2d");
			} catch {}
			il.set(n, e);
		}
		let c = il.get(n);
		if (!c) {
			a.style.setProperty("--pc-pin-y", "0px");
			continue;
		}
		let l = r.getComputedStyle(e);
		c.font = l.font || `${l.fontSize} ${l.fontFamily}`;
		let u = n.createElement("span");
		u.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline", u.setAttribute("aria-hidden", "true"), e.prepend(u);
		let d = u.getBoundingClientRect().top;
		u.remove(), e.append(u);
		let f = u.getBoundingClientRect().top;
		u.remove();
		let p = Math.abs(f - d) > .01, m = c.measureText(p ? al(e, !1) : e.textContent ?? ""), h = p ? c.measureText(al(e, !0)) : m, g = m.actualBoundingBoxAscent, _ = h.actualBoundingBoxDescent;
		if (!Number.isFinite(g) || !Number.isFinite(_)) continue;
		let v = ((d + f + (_ - g) * i) / 2 - o.top - o.height / 2) / i;
		a.style.setProperty("--pc-pin-y", `${v}px`);
	}
}
//#endregion
//#region ui/NodeGuidePreview.svelte
var sl = /* @__PURE__ */ G("<div class=\"pc-node-guide-preview svelte-y4d0xh\" role=\"img\"><div class=\"pc-node-guide-preview-card svelte-y4d0xh\" inert=\"\"><!></div></div>");
function cl(e, t) {
	Ue(t, !0);
	let n = Pi(t, "card", 3, null), r = Pi(t, "comment", 3, null), i, a = {
		hoverPin() {},
		hostResult() {},
		group() {}
	}, o = {
		select() {},
		update() {},
		command() {}
	}, s = /* @__PURE__ */ F(() => n() ? {
		...n(),
		x: 0,
		y: 0
	} : null), c = /* @__PURE__ */ F(() => r() ? {
		...r(),
		x: 0,
		y: 0,
		w: Math.min(r().w, 360),
		selected: !1,
		readOnly: !0
	} : null);
	Cn(() => {
		n(), r();
		let e = i;
		if (!e) return;
		let t = !1, a = e.ownerDocument, o = () => {
			if (t) return;
			let n = e.querySelector(".pc-node-native");
			n && ol(n, 1);
		}, s = typeof ResizeObserver > "u" ? null : new ResizeObserver(o);
		return s?.observe(e), a.addEventListener("pc-theme", o), a.fonts?.addEventListener("loadingdone", o), mr().then(o), a.fonts?.ready.then(o), () => {
			t = !0, s?.disconnect(), a.removeEventListener("pc-theme", o), a.fonts?.removeEventListener("loadingdone", o);
		};
	});
	var l = sl(), u = R(l), d = R(u), f = (e) => {
		ma(e, {
			get comment() {
				return H(c);
			},
			get actions() {
				return o;
			}
		});
	}, p = (e) => {
		na(e, {
			get card() {
				return H(s);
			},
			get actions() {
				return a;
			}
		});
	};
	J(d, (e) => {
		H(c) ? e(f) : H(s) && e(p, 1);
	}), P(u), Ni(u, (e) => i = e, () => i), P(l), V((e) => {
		Z(l, "data-guide-node", r()?.id ?? n()?.id), Z(l, "aria-label", e);
	}, [() => r() ? `Comment: ${r().title}` : n() ? `${n().label} node: ${n().ports.map((e) => e.label).join(", ")}` : "Node preview"]), K(e, l), We();
}
//#endregion
//#region src/canvas/connection-route.js?v=0.27.0
var ll = 25, ul = 12, dl = 6, fl = (e) => `${e.x},${e.y}`, pl = (e, t, n = 0) => ({
	x: e.x + t,
	y: e.y + n
}), ml = (e, t, n) => ({
	x: e.x * (1 - n) + t.x * n,
	y: e.y * (1 - n) + t.y * n
});
function hl(e, t) {
	let n = e;
	for (; n.length > 1;) n = n.slice(1).map((e, r) => ml(n[r], e, t));
	return n[0];
}
function gl(e) {
	let t = [], n = 0, r = Math.max(1, ...e.flat().flatMap((e) => [Math.abs(e.x), Math.abs(e.y)]));
	for (let i of e) {
		let e = i.length === 2 ? 1 : 64, a = i[0];
		for (let o = 1; o <= e; o++) {
			let s = hl(i, o / e), c = Math.hypot(s.x / r - a.x / r, s.y / r - a.y / r);
			t.push({
				points: i,
				start: (o - 1) / e,
				end: o / e,
				distance: c
			}), n += c, a = s;
		}
	}
	let i = n / 2;
	for (let e of t) {
		if (i <= e.distance) {
			let t = e.distance ? i / e.distance : 0;
			return hl(e.points, e.start + (e.end - e.start) * t);
		}
		i -= e.distance;
	}
	return e.at(-1).at(-1);
}
function _l(e, t) {
	let n = {
		x: e.x,
		y: e.y
	}, r = {
		x: t.x,
		y: t.y
	}, i = e.side === "left" ? -1 : 1, a = t.side === "right" ? 1 : -1, o = pl(n, i * ll), s = pl(r, a * ll), c = [[n, o]], l = Math.hypot(s.x - o.x, s.y - o.y), u = i === -a ? Math.abs(s.x - o.x) / 2 : Infinity, d = Math.min(ul / 2, l / 8, Math.max(.001, u)), f = pl(o, i * d), p = pl(s, a * d), m = p.x - f.x, h = p.y - f.y, g = Math.hypot(m, h), _;
	if (Number.isFinite(g)) _ = g ? {
		x: m / g,
		y: h / g
	} : {
		x: i,
		y: 0
	};
	else {
		let e = Math.max(Math.abs(f.x), Math.abs(f.y), Math.abs(p.x), Math.abs(p.y)), t = p.x / e - f.x / e, n = p.y / e - f.y / e, r = Math.hypot(t, n);
		_ = {
			x: t / r,
			y: n / r
		};
	}
	let v = Math.min(1, Math.max(0, -m * i / ul, m * a / ul)), y = v * v * (3 - 2 * v) * dl * Math.max(0, 1 - Math.abs(h) / 12), b = {
		x: -_.y * y,
		y: _.x * y
	}, x = pl(f, _.x * d + b.x, _.y * d + b.y), S = pl(p, -_.x * d + b.x, -_.y * d + b.y), C = (e) => {
		let t = Math.sqrt(Math.max(0, (1 + e) / 2));
		return 4 / 3 * d * t / (1 + t) + 2 / 3 * y;
	}, w = C(i * _.x), T = C(-a * _.x), E = Math.min(1, l / 24), D = E * E * (3 - 2 * E), O = pl(ml(o, s, .5), 0, -i * dl), k = ml(O, x, D), A = ml(O, S, D), j = 6 * (1 - D) + w * D, M = 6 * (1 - D) + T * D, ee = (d * (1 - D) + w * D) * D, te = (d * (1 - D) + T * D) * D;
	return c.push([
		o,
		pl(o, i * j),
		pl(k, -_.x * ee, -_.y * ee),
		k
	]), (k.x !== A.x || k.y !== A.y) && c.push([k, A]), c.push([
		A,
		pl(A, _.x * te, _.y * te),
		pl(s, a * M),
		s
	], [s, r]), {
		d: `M ${fl(n)} ` + c.map((e) => `${e.length === 2 ? "L" : "C"} ${e.slice(1).map(fl).join(" ")}`).join(" "),
		label: gl(c)
	};
}
//#endregion
//#region src/ui/node-guide-preview.js
function vl(e, t) {
	return e.flatMap((e) => {
		let n = t(e.from, e.fromPort), r = t(e.to, e.toPort);
		if (!n || !r) return [];
		let i = _l(n, r);
		return [{
			id: e.id,
			kind: e.kind,
			d: i.d,
			className: "pc-wire pc-wire-native" + (e.off ? " pc-wire-off" : ""),
			label: {
				...i.label,
				text: e.kind,
				className: "pc-wire-label"
			}
		}];
	});
}
function yl(e, t, n, r) {
	let i = new Map(e.map((e) => [e.id, e])), a = [];
	for (; i.size;) {
		let e = [...i.values()].filter((e) => !t.some((t) => t.to === e.id && i.has(t.from) && t.from !== e.id)), n = (e.length ? e : [...i.values()]).sort((e, t) => e.y - t.y || e.x - t.x)[0];
		i.delete(n.id), a.push(n);
	}
	let o = r < 500, s = Math.max(1, (r - 40) / .92), c = 0, l = 0, u = 0;
	return a.map((e) => {
		let t = n.get(e.id) ?? {
			w: 200,
			h: 100
		};
		c && (o || c + t.w > s) && (c = 0, l += u + 32, u = 0);
		let r = {
			id: e.id,
			x: c,
			y: l
		};
		return c += t.w + 32, u = Math.max(u, t.h), r;
	});
}
function bl(e, t, n, r, i, a) {
	if (t.length !== 1 || !e.length) return null;
	let o = t[0];
	if (!e.every((e) => {
		let t = r.get(e.id);
		return t && e.x >= o.x && e.y >= o.y + 36 && e.x + t.w <= o.x + o.w && e.y + t.h <= o.y + o.h;
	})) return null;
	let s = yl(e, n, r, i - 48 * .92), c = 36 + Math.max(0, a) + 24, l = s.map((e) => ({
		...e,
		x: e.x + 24,
		y: e.y + c
	})), u = Math.max(...l.map((e) => e.x + r.get(e.id).w)) + 24, d = Math.max(...l.map((e) => e.y + r.get(e.id).h)) + 24;
	return {
		nodes: l,
		comments: [{
			...o,
			x: 0,
			y: 0,
			w: u,
			h: d
		}]
	};
}
//#endregion
//#region src/canvas/camera.js
function xl(e) {
	return e.defaultPrevented || e.isComposing || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey ? null : e.key === "]" ? 1.15 : e.key === "[" ? 1 / 1.15 : null;
}
//#endregion
//#region ui/NodeGuideCanvas.svelte
var Sl = /* @__PURE__ */ G("<div class=\"pc-node-guide-canvas-footer svelte-16v7ohd\"><!></div>"), Cl = /* @__PURE__ */ G("<div class=\"pc-node-guide-canvas svelte-16v7ohd\"><div class=\"pc-canvas-host pc-node-guide-viewport\" aria-label=\"Example node graph\" role=\"region\" tabindex=\"0\"><!></div> <!></div>");
function wl(e, t) {
	Ue(t, !0);
	let n = Pi(t, "focusNodeIds", 19, () => []), r, i, a = {
		hoverPin() {},
		hostResult() {},
		group() {}
	}, o = {
		select() {},
		update() {},
		command() {}
	};
	Cn(() => {
		let e = t.scene, a = r, s = i;
		if (!a || !s) return;
		let c = a.ownerDocument, l = e.cards.length > 8 && n().length ? new Set(n()) : null;
		if (l) for (let t of e.connections) (n().includes(t.from) || n().includes(t.to)) && (l.add(t.from), l.add(t.to));
		let u = new AbortController(), d = {
			x: 0,
			y: 0,
			scale: 1
		}, f = !1, p = !1, m = !0, h = null, g = 0, _ = /* @__PURE__ */ new Map(), v = "", y = () => s.getLayers();
		function b() {
			let { viewport: e } = y();
			e.style.transform = `translate(${d.x}px, ${d.y}px) scale(${d.scale})`;
			let t = 24 * d.scale, n = `${d.x}px ${d.y}px`, r = c.documentElement.dataset.pcGrid;
			r === "lines" ? (a.style.backgroundSize = `${t}px ${t}px, ${t}px ${t}px, ${t * 5}px ${t * 5}px, ${t * 5}px ${t * 5}px`, a.style.backgroundPosition = `${n}, ${n}, ${n}, ${n}`) : r === "paper" ? (a.style.backgroundSize = `${t * 1.5}px ${t * 1.5}px, 100% 100%`, a.style.backgroundPosition = `${n}, 0 0`) : r === "scan" ? (a.style.backgroundSize = "auto, 100% 100%", a.style.backgroundPosition = "0 0, 0 0") : (a.style.backgroundSize = `${t}px ${t}px`, a.style.backgroundPosition = n);
		}
		function x() {
			if (f || !a.getClientRects().length || !a.clientWidth) return null;
			let t = [...a.querySelectorAll(".pc-node-native, .pc-comment-frame")];
			for (let e of t) e.classList.contains("pc-node-native") && ol(e, d.scale);
			let n = y().viewport.getBoundingClientRect(), r = /* @__PURE__ */ new Map();
			for (let e of a.querySelectorAll(".pc-port")) {
				let t = e.getBoundingClientRect();
				r.set(`${e.dataset.node}\0${e.dataset.port}`, {
					x: (t.left + t.width / 2 - n.left) / d.scale,
					y: (t.top + t.height / 2 - n.top) / d.scale,
					side: e.dataset.side
				});
			}
			let i = vl(e.connections, (e, t) => r.get(`${e}\0${t}`)), o = l ? t.filter((e) => l.has(e.dataset.id ?? "")) : t, c = (o.length ? o : t).reduce((e, t) => {
				let n = parseFloat(t.style.left), r = parseFloat(t.style.top);
				return {
					left: Math.min(e.left, n),
					top: Math.min(e.top, r),
					right: Math.max(e.right, n + t.offsetWidth),
					bottom: Math.max(e.bottom, r + t.offsetHeight)
				};
			}, {
				left: Infinity,
				top: Infinity,
				right: -Infinity,
				bottom: -Infinity
			});
			return zt(() => s.setWires(i, {
				w: Math.max(2e3, c.right + 200),
				h: Math.max(1500, c.bottom + 200)
			}, null)), t.length ? c : null;
		}
		function S() {
			if (e.cards.length > 8 || !a.clientWidth) return;
			let t = [...a.querySelectorAll(".pc-node-native")];
			if (!t.length) return;
			let n = a.querySelector(".pc-comment-notes"), r = () => a.clientWidth + ":" + t.map((e) => `${e.dataset.id}:${e.offsetWidth}:${e.offsetHeight}`).join("|") + ":" + (n?.offsetHeight ?? 0);
			if (r() === v) return;
			let i = new Map(t.map((e) => [e.dataset.id, {
				w: e.offsetWidth,
				h: e.offsetHeight
			}])), c;
			if (e.comments.length) {
				let t = bl(e.cards, e.comments, e.connections, i, a.clientWidth, n?.offsetHeight ?? 0);
				if (!t) return;
				zt(() => {
					s.setPositions(t.nodes, []), s.setComments(t.comments, o);
				});
				let r = bl(e.cards, e.comments, e.connections, i, a.clientWidth, n?.offsetHeight ?? 0);
				zt(() => {
					s.setPositions(r.nodes, []), s.setComments(r.comments, o);
				}), c = r.comments[0].h;
			} else {
				let t = yl(e.cards, e.connections, i, a.clientWidth);
				zt(() => s.setPositions(t, [])), c = Math.max(...t.map((e) => e.y + i.get(e.id).h));
			}
			v = r(), a.style.height = a.clientWidth < 500 ? `${Math.min(650, Math.max(320, c * .92 + 40))}px` : "";
		}
		function C() {
			S();
			let e = x();
			if (!e) return;
			let t = Math.max(1, e.right - e.left), n = Math.max(1, e.bottom - e.top);
			d.scale = Math.max(.92, Math.min(1.08, (a.clientWidth - 40) / t, (a.clientHeight - 40) / n)), d.x = (a.clientWidth - t * d.scale) / 2 - e.left * d.scale, d.y = (a.clientHeight - n * d.scale) / 2 - e.top * d.scale, m = !0, b(), x();
		}
		function w(e, t, n) {
			let r = Math.max(.1, Math.min(3, d.scale * e));
			d.x = t - (t - d.x) * r / d.scale, d.y = n - (n - d.y) * r / d.scale, d.scale = r, m = !1, b(), x();
		}
		let T = (e, t, n = {}) => a.addEventListener(e, t, {
			...n,
			signal: u.signal
		});
		T("wheel", (e) => {
			let t = e;
			t.preventDefault(), t.stopPropagation();
			let n = a.getBoundingClientRect();
			w(Math.exp(-t.deltaY * .002), t.clientX - n.left, t.clientY - n.top);
		}, { passive: !1 }), T("pointerdown", (e) => {
			let t = e;
			if (t.button === 0 || t.button === 1) {
				if (t.preventDefault(), t.stopPropagation(), a.focus({ preventScroll: !0 }), _.set(t.pointerId, {
					x: t.clientX,
					y: t.clientY
				}), a.setPointerCapture(t.pointerId), _.size === 2) {
					let [e, t] = [..._.values()];
					g = Math.hypot(e.x - t.x, e.y - t.y), h = null;
				} else h = {
					x: t.clientX,
					y: t.clientY,
					originX: d.x,
					originY: d.y
				};
				a.classList.add("pc-panning");
			}
		}), T("pointermove", (e) => {
			let t = e;
			if (_.has(t.pointerId)) {
				if (t.preventDefault(), t.stopPropagation(), _.set(t.pointerId, {
					x: t.clientX,
					y: t.clientY
				}), _.size === 2) {
					let [e, t] = [..._.values()], n = Math.hypot(e.x - t.x, e.y - t.y), r = a.getBoundingClientRect();
					g && w(n / g, (e.x + t.x) / 2 - r.left, (e.y + t.y) / 2 - r.top), g = n;
				} else h && (d.x = h.originX + t.clientX - h.x, d.y = h.originY + t.clientY - h.y, m = !1, b());
			}
		});
		let E = (e) => {
			e.stopPropagation();
			let t = e.pointerId;
			if (_.delete(t)) {
				if (a.hasPointerCapture(t) && a.releasePointerCapture(t), h = null, g = 0, _.size === 1) {
					let [e] = _.values();
					h = {
						x: e.x,
						y: e.y,
						originX: d.x,
						originY: d.y
					};
				} else if (_.size >= 2) {
					let [e, t] = [..._.values()];
					g = Math.hypot(e.x - t.x, e.y - t.y);
				}
				a.classList.toggle("pc-panning", _.size > 0);
			}
		};
		for (let e of [
			"pointerup",
			"pointercancel",
			"lostpointercapture"
		]) T(e, E);
		for (let e of [
			"mousedown",
			"mouseup",
			"click",
			"dblclick",
			"contextmenu"
		]) T(e, (e) => {
			e.preventDefault(), e.stopPropagation();
		});
		T("keydown", (e) => {
			let t = e;
			if (t.key === "Escape" || t.key === "Tab") return;
			t.stopPropagation();
			let n = t.target;
			if (c.activeElement !== a || n?.closest("input, textarea, select, button, summary, a, [contenteditable]:not([contenteditable=\"false\"]), [role=\"button\"], [role=\"textbox\"], [role=\"combobox\"], [role=\"slider\"], [role=\"spinbutton\"]")) return;
			let r = _.size ? null : xl(t);
			t.key === "Home" ? (t.preventDefault(), C()) : r === null ? t.key.startsWith("Arrow") && (t.preventDefault(), d.x += t.key === "ArrowLeft" ? 40 : t.key === "ArrowRight" ? -40 : 0, d.y += t.key === "ArrowUp" ? 40 : t.key === "ArrowDown" ? -40 : 0, m = !1, b()) : (t.preventDefault(), w(r, a.clientWidth / 2, a.clientHeight / 2));
		});
		let D = () => {
			!f && p && (m ? C() : (S(), b(), x()));
		}, O = typeof ResizeObserver > "u" ? null : new ResizeObserver(D);
		return O?.observe(a), c.addEventListener("pc-theme", D), c.fonts?.addEventListener("loadingdone", D), mr().then(() => {
			if (f) return;
			zt(() => {
				s.setNodes(e.cards), s.setComments(e.comments, o);
			});
			let { nodeLayer: t, commentLayer: n, svg: r } = y();
			t.inert = !0, n.inert = !0, r.style.pointerEvents = "none";
			for (let e of a.querySelectorAll(".pc-node-native, .pc-comment-frame")) O?.observe(e);
			p = !0, b(), C(), c.fonts?.ready.then(D);
		}), () => {
			f = !0, u.abort(), O?.disconnect(), c.removeEventListener("pc-theme", D), c.fonts?.removeEventListener("loadingdone", D);
			for (let e of _.keys()) a.hasPointerCapture(e) && a.releasePointerCapture(e);
			_.clear(), a.classList.remove("pc-panning");
		};
	});
	var s = Cl(), c = R(s);
	Ni(Eo(R(c), { get actions() {
		return a;
	} }), (e) => i = e, () => i), P(c), Ni(c, (e) => r = e, () => r);
	var l = B(c, 2), u = (e) => {
		var n = Sl();
		ri(R(n), () => t.footer), P(n), K(e, n);
	};
	J(l, (e) => {
		t.footer && e(u);
	}), P(s), K(e, s), We();
}
//#endregion
//#region ui/NodeGuide.svelte
var Tl = /* @__PURE__ */ G("<li class=\"svelte-1bq62g5\"> </li>"), El = /* @__PURE__ */ G("<div class=\"svelte-1bq62g5\"><dt class=\"svelte-1bq62g5\"> </dt><dd class=\"svelte-1bq62g5\"> </dd></div>"), Dl = /* @__PURE__ */ G("<p class=\"svelte-1bq62g5\">This node has no settings to configure.</p>"), Ol = /* @__PURE__ */ G("<p class=\"pc-guide-requirements svelte-1bq62g5\"><strong>Before running:</strong> </p>"), kl = /* @__PURE__ */ G("<div class=\"pc-guide-fixture svelte-1bq62g5\"><div class=\"svelte-1bq62g5\"><strong class=\"svelte-1bq62g5\"> </strong><button type=\"button\" class=\"pc-btn svelte-1bq62g5\">Copy</button></div> <textarea readonly=\"\" class=\"svelte-1bq62g5\"></textarea></div>"), Al = /* @__PURE__ */ G("<p role=\"status\" class=\"svelte-1bq62g5\"> </p>"), jl = /* @__PURE__ */ G("<details class=\"pc-guide-fixtures svelte-1bq62g5\"><summary class=\"svelte-1bq62g5\">Setup data</summary> <p class=\"svelte-1bq62g5\">Copy each sample into its named workflow file before running the example.</p> <!> <!></details>"), Ml = /* @__PURE__ */ G("<p class=\"svelte-1bq62g5\"> </p>"), Nl = /* @__PURE__ */ G("<p role=\"alert\" class=\"svelte-1bq62g5\"> </p>"), Pl = /* @__PURE__ */ G("<div class=\"pc-guide-example-action svelte-1bq62g5\"><button type=\"button\" class=\"pc-btn svelte-1bq62g5\"> </button> <!> <!></div>"), Fl = /* @__PURE__ */ G("<h3 class=\"svelte-1bq62g5\"> </h3><p class=\"svelte-1bq62g5\"> </p> <!> <!> <!> <ol class=\"svelte-1bq62g5\"></ol> <p class=\"svelte-1bq62g5\"><strong>Result:</strong> </p>", 1), Il = /* @__PURE__ */ G("<div class=\"pc-node-guide svelte-1bq62g5\"><p class=\"pc-guide-summary svelte-1bq62g5\"> </p> <!> <section><h3 class=\"svelte-1bq62g5\">How to use it</h3><ol class=\"svelte-1bq62g5\"></ol></section> <details data-guide-settings=\"\" open=\"\" class=\"svelte-1bq62g5\"><summary class=\"svelte-1bq62g5\">Settings and options</summary> <dl class=\"svelte-1bq62g5\"></dl> <!></details> <details data-guide-example=\"\" class=\"svelte-1bq62g5\"><summary class=\"svelte-1bq62g5\">Example</summary> <!></details></div>");
function Ll(e, t) {
	Ue(t, !0);
	let n = Pi(t, "actions", 19, () => ({})), r = /* @__PURE__ */ I(!1), i = /* @__PURE__ */ I(!1), a = /* @__PURE__ */ I(""), o = /* @__PURE__ */ I(null), s = /* @__PURE__ */ I(null), c = /* @__PURE__ */ I(tn({
		enabled: !1,
		reason: ""
	})), l = /* @__PURE__ */ I("");
	Cn(() => {
		t.contextKey, t.guide.key, H(r) && L(c, n().status?.(t.guide.key) ?? {
			enabled: !1,
			reason: "Example insertion is unavailable in this view."
		}, !0);
	});
	function u(e) {
		if (L(r, e.currentTarget.open, !0), H(r) && !H(o)) {
			let e = n().example?.(t.guide.key);
			e?.ok ? (L(o, e.data.example), L(s, e.data.scene)) : L(a, e && !e.ok ? e.error.message : "This example is unavailable.", !0);
		}
		H(r) || (L(o, null), L(s, null), L(a, ""), L(l, ""));
	}
	async function d(e) {
		try {
			await navigator.clipboard.writeText(e.content), L(l, `Copied ${e.name}.`);
		} catch {
			L(l, `Select and copy the data for ${e.name} below.`);
		}
	}
	async function f() {
		if (n().add && H(c).enabled && !H(i)) {
			L(i, !0), L(a, "");
			try {
				let e = await n().add(t.guide.key);
				e.ok ? t.close() : L(a, e.error.message, !0);
			} catch {
				L(a, "The example could not be added. Try again.");
			} finally {
				L(i, !1);
			}
		}
	}
	var p = Il(), m = R(p), h = R(m, !0);
	P(m);
	var g = B(m, 2);
	cl(g, {
		get card() {
			return t.guide.card;
		},
		get comment() {
			return t.guide.comment;
		}
	});
	var _ = B(g, 2), v = B(R(_));
	Y(v, 21, () => t.guide.howTo, qr, (e, t) => {
		var n = Tl(), r = R(n, !0);
		P(n), V(() => q(r, H(t))), K(e, n);
	}), P(v), P(_);
	var y = B(_, 2), b = B(R(y), 2);
	Y(b, 21, () => t.guide.settings, (e) => e.key, (e, t) => {
		var n = El(), r = R(n), i = R(r, !0);
		P(r);
		var a = B(r), o = R(a, !0);
		P(a), P(n), V(() => {
			q(i, H(t).label), q(o, H(t).description);
		}), K(e, n);
	}), P(b);
	var x = B(b, 2), S = (e) => {
		K(e, Dl());
	};
	J(x, (e) => {
		t.guide.settings.length || e(S);
	}), P(y);
	var C = B(y, 2), w = B(R(C), 2), T = (e) => {
		var t = Fl(), n = z(t), r = R(n, !0);
		P(n);
		var u = B(n), p = R(u, !0);
		P(u);
		var m = B(u, 2), h = (e) => {
			var t = Ol(), n = B(R(t));
			P(t), V((e) => q(n, ` ${e ?? ""}`), [() => H(o).requirements.join(" ")]), K(e, t);
		};
		J(m, (e) => {
			H(o).requirements.length && e(h);
		});
		var g = B(m, 2), _ = (e) => {
			var t = jl(), n = B(R(t), 4);
			Y(n, 17, () => H(o).fixtures, (e) => e.name, (e, t) => {
				var n = kl(), r = R(n), i = R(r), a = R(i, !0);
				P(i);
				var o = B(i);
				P(r);
				var s = B(r, 2);
				at(s), Z(s, "spellcheck", !1), P(n), V(() => {
					q(a, H(t).name), Z(o, "aria-label", `Copy ${H(t).name}`), Z(s, "aria-label", H(t).name), wi(s, H(t).content);
				}), W("click", o, () => d(H(t))), K(e, n);
			});
			var r = B(n, 2), i = (e) => {
				var t = Al(), n = R(t, !0);
				P(t), V(() => q(n, H(l))), K(e, t);
			};
			J(r, (e) => {
				H(l) && e(i);
			}), P(t), K(e, t);
		};
		J(g, (e) => {
			H(o).fixtures?.length && e(_);
		});
		var v = B(g, 2);
		{
			let e = (e) => {
				var t = Pl(), n = R(t), r = R(n, !0);
				P(n);
				var o = B(n, 2), s = (e) => {
					var t = Ml(), n = R(t, !0);
					P(t), V(() => q(n, H(c).reason)), K(e, t);
				};
				J(o, (e) => {
					H(c).reason && e(s);
				});
				var l = B(o, 2), u = (e) => {
					var t = Nl(), n = R(t, !0);
					P(t), V(() => q(n, H(a))), K(e, t);
				};
				J(l, (e) => {
					H(a) && e(u);
				}), P(t), V(() => {
					n.disabled = !H(c).enabled || H(i), Z(n, "title", H(c).reason || void 0), q(r, H(i) ? "Adding…" : "Add example to current tab");
				}), W("click", n, f), K(e, t);
			}, t = /* @__PURE__ */ F(() => H(o).focus?.nodeIds ?? []);
			wl(v, {
				get scene() {
					return H(s);
				},
				get focusNodeIds() {
					return H(t);
				},
				footer: e,
				$$slots: { footer: !0 }
			});
		}
		var y = B(v, 2);
		Y(y, 21, () => H(o).steps, qr, (e, t) => {
			var n = Tl(), r = R(n, !0);
			P(n), V(() => q(r, H(t))), K(e, n);
		}), P(y);
		var b = B(y, 2), x = B(R(b));
		P(b), V(() => {
			q(r, H(o).title), q(p, H(o).description), q(x, ` ${H(o).expected ?? ""}`);
		}), K(e, t);
	}, E = (e) => {
		var t = Al(), n = R(t, !0);
		P(t), V(() => q(n, H(a) || "This example is unavailable.")), K(e, t);
	};
	J(w, (e) => {
		H(r) && H(o) && H(s) ? e(T) : H(r) && e(E, 1);
	}), P(C), P(p), V(() => {
		Z(p, "data-guide-key", t.guide.key), q(h, t.guide.summary);
	}), U("toggle", C, u), K(e, p), We();
}
Er(["click"]);
//#endregion
//#region src/ui/node-guide-content.js?v=0.27.0
var $ = (e, t, ...n) => ({
	title: e,
	summary: t,
	howTo: n
}), Rl = {
	"scene-context": $("Scene Context", "Bring a bounded selection of recent chat and character information into the workflow.", "Choose how many recent messages to include and whether to include character information.", "Choose Public for observable material or Actor for the selected character perspective.", "Connect Context to Smart Compactor, Response Plan, or another Context input."),
	"reply-snapshot": $("Reply Snapshot", "Freeze the latest completed assistant reply so proposed edits stay tied to the correct reply.", "Place this source in the Response stage after a supported completed text reply.", "Connect Draft to Text Rules or Pattern Scan, then inspect proposed changes before applying them."),
	"smart-compactor": $("Smart Compactor", "Fit conversation context into a smaller budget while keeping recent messages and protected wording.", "Connect a Context source and set the target size.", "Choose Select to remove older flexible messages, or Compress to request a summary when needed.", "Set recent-message retention and protected phrases, then inspect the resulting context."),
	"response-plan": $("Response Plan", "Ask a model for writing direction, constraints, and possible next beats before generating a reply.", "Connect prepared Context and write instructions for the kind of plan you want.", "Choose the model binding and completion limit, then connect Guidance to the generation path.", "Treat suggested events as possibilities and keep the player’s decisions open."),
	"pattern-scan": $("Pattern Scan", "Find authored literal patterns in a frozen Draft without changing the reply.", "Connect a Draft and add the literal patterns you want to find.", "Choose the text scope and any exemptions or wording to protect.", "Connect the scanned Draft to Repair and inspect its findings."),
	repair: $("Repair", "Inspect unwanted prose or ask a model to propose changes to permitted parts of a frozen reply.", "Connect a Draft, usually from Pattern Scan, and choose a repair or cleanup mode.", "Set instructions, protection, and any cleanup categories and scope.", "Connect Patches to Validate Patches and review the resulting candidate.", "For manual inspection, use Reply Snapshot from a completed assistant reply; a path through Generate Reply must start with Send."),
	"validate-patches": $("Validate Patches", "Check proposed edits against the original Draft and build a candidate that can be reviewed.", "Connect Patches from Repair, Text Rules, or a Draft transfer tool.", "Inspect the candidate’s original text and changes; invalid edits stop here.", "Use Review Gate for candidate review diagnostics and Review / Publish for an owned final Draft.", "Run to here can inspect a Reply Snapshot branch without generating or publishing a new reply."),
	guidance: $("Guidance", "Keep writing direction within its token budget and expose it for inspection or downstream generation.", "Connect Guidance from Compose, Response Plan, or another guidance producer.", "Set the budget and inspect the result with Run to here.", "Wire the bounded guidance into Generate Reply for the generation you want it to influence."),
	"review-gate": $("Review Gate", "Mark a revised candidate as requiring review; passing this node does not accept it.", "Connect a Candidate from Validate Patches.", "Inspect the original, revision, and changes in Preview before accepting a root result."),
	"apply-reply": $("Apply Reply", "Inspect a validated reply edit from a patch pipeline. Use Review / Publish to publish an owned final Draft in a unified workflow.", "Connect a Candidate, usually through Review Gate.", "Use Run to here to inspect the original reply and proposed revision.", "For publication, finish an owned Draft at Review / Publish and apply the reviewed root result."),
	reroute: $("Reroute", "Carry a value unchanged through a small routing point to make connections easier to read.", "Choose the same value type as the connection you want to route.", "Connect the source to Input and Output to its destination, or double-click a wire to insert one."),
	compose: $("Compose", "Bring pieces of text together to build a prompt, combine notes, or prepare instructions for the next reply.", "Add named sections, write their saved text, and choose Save Sections before connecting new inputs.", "Choose Text or Guidance for each section input, then connect a matching value to replace its saved text.", "Choose Join for section order or Template for your own layout; choose Text or Preparation Guidance."),
	"text-rules": $("Text Rules", "Replace or extract text using authored literal or regular-expression rules without a model.", "Choose Text for ordinary text or Draft for proposed reply patches in Response.", "Add rules, choose Replace or Extract, and save the rules before running.", "For Draft replacement, connect Patches to Validate Patches and review the proposed edits."),
	"json-decode": $("JSON Decode", "Turn raw JSON text into structured Data or check Data against an optional schema.", "Choose Parse and connect raw JSON Text, or choose Check and connect Data.", "Enter an optional supported schema as raw JSON, save it, and inspect the result."),
	"select-fields": $("Select Fields", "Build a smaller Data object by selecting named paths from connected structured values.", "Connect Data and add a name and path for each field you want.", "Mark optional fields and defaults where appropriate, then save the field list.", "Connect the selected Data to Compose or another structured-data tool."),
	"style-transfer": $("Style Transfer", "Use a reference to reshape narration, voice, rhythm, or register while preserving the supplied content.", "Choose Text or Response Draft input and connect both Input and Reference.", "Choose the style mode and scope separately, then set strength and protected wording.", "Inspect Text directly or pass Draft Patches through Validate Patches for review."),
	"format-transfer": $("Format Transfer", "Reorganize supplied text using a text example or structured template as a reference.", "Choose Text or Response Draft input and connect an example or template to Reference.", "Set scope, instructions, and protected wording; a Data reference may require exact existing content.", "Inspect Text directly or validate and review proposed Draft patches."),
	"terminology-map": $("Terminology Map", "Apply a supplied glossary consistently without a model or cascading replacements.", "Connect Text or a Response Draft and a Data glossary with entries containing from and to.", "Choose whole-word or phrase matching, case sensitivity, and protected wording.", "Inspect Text or validate the proposed Draft patches before publication."),
	reflect: $("Reflect", "Ask a model to assess supplied character, episode, or scene evidence and return a proposed reflection.", "Connect Context and optionally stored State or Episodes Data.", "Choose Character, Recall, or Scene and write any assessment instructions.", "Inspect the reflection, then connect it to Express or another compatible Data input."),
	internalize: $("Internalize", "Propose actor-state updates from settled events while preserving guarded beliefs and enduring traits.", "Connect matching stored State and settled Events Data.", "Choose Experience, Pattern, or Recovery and set instructions for the proposal.", "Inspect the proposed updates before sending them to a Response Memory Commit."),
	express: $("Express", "Turn a reflection into behavior guidance, attention guidance, or fictional inner-voice text.", "Connect Reflection Data to Assessment and any matching supporting evidence.", "Choose Behavior or Attention for deterministic Guidance, or Inner Voice for model-written Text.", "Inspect the result and connect it to a compatible Guidance or Text input."),
	context: $("Context", "Assemble context, filter it for an actor, or reduce it to a useful size.", "Choose Assemble, Perspective, or Focus; the inputs and settings change with the mode.", "Connect every required Context input and set the actor or budgeting options for your mode.", "Inspect omissions and protection reports before using the resulting Context."),
	memory: $("Memory", "Read stored actor information, recall episodes, or stage an approved state proposal for persistence.", "Choose Read for a stored view, Recall for a query, or Commit in the Response stage.", "Set the view or query; for Commit, connect a matching state proposal and choose its commit key.", "Inspect proposals before applying the reviewed root result; previewing does not save memory."),
	state: $("State", "Read or calculate explicit numeric state and proposed changes without a model.", "Choose Value, Curve, Track, Progression, or Time-decay and connect the required state and evidence.", "Author numeric values, curve settings, or rules rather than asking this node to infer them.", "Inspect the projected state and persist it only through an authorized accepted workflow path."),
	text: $("Text", "Supply saved text, instructions, notes, or a reference passage exactly as written.", "Write or paste the text in Details; empty text is allowed.", "Connect Text to a Compose section, reference input, or another Text tool."),
	"file-input": $("File Input", "Import a UTF-8 text file and keep its contents as a portable snapshot inside the node.", "Choose a text file in Details and check its filename and loaded status.", "Connect Text to a text tool or JSON Decode for structured JSON.", "Choose Replace file when you want to refresh the saved snapshot."),
	"prompt-source": $("Prompt Source", "Read a configured host prompt block as Text for composition or inspection.", "Choose the system prompt or a Prompt Manager entry identified by its stable Prompt ID.", "Choose Raw to retain the template or Resolved for supported name and formatting macros.", "Connect Text to Compose or a reference input; this reads a configured block, not the final generation prompt."),
	condition: $("Condition", "Compare an explicit Data value and return an accepted result for routing.", "Connect Data and enter the path to the value to check.", "Choose an operator and comparison value; numeric comparisons need finite numbers.", "Connect the result to a Branch condition or another decision input."),
	branch: $("Branch", "Route one value to Yes, No, or Unresolved using an explicit boolean decision.", "Choose the value type and connect the value plus Condition Data.", "Connect the outputs you need; only the selected route continues.", "Use optional Join inputs when bringing alternative routes together again."),
	join: $("Join", "Select the first or last available value from declared inputs of the same type.", "Choose the value type and define uniquely named input slots.", "Mark alternative branches optional and connect required contributions.", "Choose First or Last in declared input order, then connect the selected value onward."),
	collect: $("Collect", "Gather completed typed contributions into a Data array in declared input order.", "Choose the contribution type and define uniquely named input slots.", "Connect contributions and mark slots optional when a skipped branch may be omitted.", "Connect the resulting Data array to Collection or For Each."),
	"confidence-gate": $("Confidence Gate", "Compare a numeric score against explicit thresholds to accept, reject, or leave a decision unresolved.", "Connect decision Data and choose the path to a finite numeric score.", "Set acceptance and rejection thresholds and whether higher or lower scores are preferred.", "Handle the middle unresolved range; a model’s confidence alone does not prove an event."),
	"for-each": $("For Each", "Run a pinned helper over an ordered Data array within explicit iteration and request limits.", "Choose an existing pinned Data item/result helper in Configure node and connect an array.", "Set item and per-iteration request limits; Projected-state also needs explicit state.", "Check helper model bindings and inspect the ordered results before using them."),
	decision: $("Decision", "Ask a model typed questions about supplied evidence and retain unresolved answers explicitly.", "Choose Data or Text input and connect the evidence to judge.", "Author questions with stable IDs and yes/no, choice, or ordered-score answer types.", "Inspect answers and confidence before using a deliberate gate or confirming events."),
	combine: $("Combine", "Add a named text section to a Draft while keeping its original reply body and source identity.", "Connect the Draft and the Text section to append.", "Choose a section identity and separator, then inspect the assembled Draft.", "Send the final owned Draft to Review / Publish for review."),
	append: $("Append", "Add a named text section to a Draft without replacing its original reply body.", "Connect a Draft and the Text you want to append.", "Set the section identity and separator, then inspect the assembled Draft before review."),
	"render-notes": $("Render Notes", "Present public structured notes as plain text or a labeled HTML disclosure.", "Connect public Data containing the notes you want to show.", "Set the title and presentation, then connect Text to Append or Compose."),
	enrich: $("Enrich", "Ask a model to expand supplied Data while keeping the declared identities intact.", "Connect Data and optional supporting Context.", "Write bounded enrichment instructions and choose a completion limit.", "Inspect the returned Data before feeding it into later calculations or presentation."),
	"draft-text": $("Draft Text", "Read the original body or assembled visible text from a Draft as ordinary Text.", "Connect a Draft in the Response stage.", "Choose Body to omit appended notes or Assembled to include them, then connect Text onward."),
	extract: $("Extract", "Extract structured records from Text or a Draft using literal patterns or one model request.", "Choose the source type, connect it, and choose Literal or Model extraction.", "Save literal patterns or write model instructions and an optional record schema.", "Inspect the records; extracting a claim does not confirm that it actually happened."),
	"model-call": $("Model Call", "Make one explicit auxiliary model request using a text prompt and optional supporting values.", "Connect Text and any relevant Context or Data.", "Write instructions, choose Text or Data output, and set an optional Data schema.", "Choose the model binding and inspect its result before continuing."),
	"revise-draft": $("Revise Draft", "Ask a model to revise permitted parts of an owned Draft while retaining its reply identity.", "Connect a Draft in Response and any relevant Context or Data.", "Write revision instructions and choose editable scope and protected wording.", "Inspect the revised Draft, then send the final result to Review / Publish."),
	"player-event-source": $("Player Event Source", "Expose the actual player turn that activated the unified workflow as checked source Data.", "Place this source in Preparation, either in Main or inside a static subgraph.", "Connect Source to an item trigger or event-normalization path; mentions still need interpretation and confirmation."),
	"on-send": $("On Send", "Start a unified workflow from the native chat activation that owns one reply generation.", "Place On Send in Preparation, either in Main or inside a static subgraph.", "Connect Activation to Generate Reply to establish the workflow’s generation path."),
	"generate-reply": $("Generate Reply · SillyTavern", "Generate the workflow’s one native reply through the selected SillyTavern connection.", "Connect On Send’s Activation and optional Preparation Guidance.", "Set the guidance budget and use the host’s selected model and generation settings.", "Connect Draft through any Response processing and finish at Review / Publish."),
	"review-publish": $("Review / Publish", "Prepare the owned final Draft and staged effects for explicit review and application.", "Connect the final owned Draft in Response, either in Main or inside a static subgraph.", "Run the workflow and inspect its reply and proposed effects in Preview.", "Choose Apply reviewed candidate to accept the root result, or reject it."),
	format: $("Format", "Validate and serialize explicit records as JSON, JSON Lines, CSV, text, or Markdown.", "Choose Records or raw JSON Text input and connect the matching value.", "Choose serialization, field mapping, and any schema or CSV columns.", "Inspect Records, Text, and the report before connecting a file mutation."),
	"read-file": $("Read File", "Read an authorized workflow data source and return its text, parsed document, and live write reference.", "Authorize the source in Workflow → Configure → Workflow Data, then select it here.", "Choose selected-actor scope or connect exact presence for the configured actor.", "Use Document for calculations, Text for transformation, and Reference for an authorized Write to File."),
	"write-file": $("Write to File", "Stage a checked change to an authorized workflow data source for acceptance with the reviewed root result.", "Connect the exact Reference from Read File and the Records or Text required by the mutation.", "Choose the mutation and any collection, identity, schema, or separator policies.", "Inspect the projection and receipt; apply the reviewed root result to save the staged change."),
	"project-document": $("Project Document", "Preview a document mutation as Text and Data without reading or writing a live file.", "Connect serialized Source Text and the Records or Text needed for the mutation.", "Choose the document format and mutation settings.", "Inspect the projected document or calculate on its Data before an authorized write path."),
	"commit-clock": $("Clock Commit", "Stage accepted story-clock movement and settled due events from a genuine time projection.", "Connect the retained Report from Advance Time in Response, either in Main or inside a static subgraph.", "Connect any additional checked due occurrences and inspect the staging receipt.", "Apply the reviewed root result to save the clock and consumed occurrence IDs."),
	"story-clock": $("Story Clock", "Read an accepted story clock from an authorized workflow data source.", "Create or authorize a clock JSON source in Workflow Data and select its identity.", "Optionally specify the expected calendar, then connect Clock to Advance Time or Time Trigger."),
	"time-trigger": $("Time Trigger", "Find scheduled occurrences crossed between a previous and destination story clock.", "Connect both clocks and choose Daily, Interval, or Delay scheduling.", "Set a stable schedule identity, revision, and the exact due-time settings.", "Set limits and already settled IDs, then inspect due occurrences and their report."),
	"advance-time": $("Advance Time", "Project explicit forward story time and enumerate due events while retaining any interrupted remainder.", "Connect the previous Clock and an explicit duration or destination proposal in integer minutes.", "Supply schedules through the settings or the input, and choose Interrupt or Catch-up.", "Inspect Clock, Occurrences, Remainder, and Report before passing the retained report to Clock Commit."),
	"actor-context": $("Actor Context", "Read one present actor’s authorized private character, messages, and memories.", "Choose the actor identity and connect its exact live Scene Presence output.", "Use the private Context only on a compatible path for that same actor."),
	"draft-event-source": $("Draft Event Source", "Expose source-bound narrative text and authored scope from an owned Draft for event processing.", "Connect an owned Draft in Response plus authored scope Data.", "Connect Source to triggers or Event Normalize; appended notes are excluded from narrative evidence."),
	"event-normalize": $("Event Normalize", "Check event candidates against source evidence or convert confirmed events for numeric progression.", "Choose Candidates and connect Source, Entities, and Candidates, or choose Progression with confirmed Events.", "For Progression, optionally name the resulting event type and supply an exact story minute or matching Clock.", "Inspect the checked events; normalization alone does not confirm an interpretation."),
	"prompted-memory": $("Prompted Memory", "Recall or propose a memory for an authorized actor and a genuine current-holder event.", "Choose the actor and connect matching live Presence and holder-attributed event Data.", "Choose Recall, Create, or Recall-or-create, write the prompt, and explicitly allow creation when wanted.", "Inspect the private proposal and use a matching authorized persistence path to record it."),
	"item-mention-trigger": $("Item Mention Trigger", "Find literal item mentions in a checked source while retaining an explicit activation state.", "Choose actor and item identities, add literal aliases, and connect Source and Entities.", "Choose the watched source and activation policy; connect previous state when needed.", "Inspect mentions and updated state; a mention alone does not establish item use or ownership."),
	"item-use-trigger": $("Item Use Trigger", "Check supplied item-use candidates or ask a model to extract them with exact source evidence.", "Choose the item and watched source, then connect Source and Entities.", "Choose Candidates with candidate Data or Extract with bounded instructions.", "Use a deliberate Decision and Confirm Events before applying any consequence."),
	"confirm-events": $("Confirm Events", "Retain only actual accepted event occurrences that pass source, evidence, and identity checks.", "Connect checked Events and deliberate Decision Data.", "Choose Records for matched judgments or Single gate for one bounded event.", "Use confirmed occurrences for holders, state changes, or random effects."),
	"current-holder": $("Current Holder", "Attribute ordered confirmed events to their genuine item holders and project updated ownership.", "Connect confirmed Events and explicit current Holders Data.", "Inspect attributed events and updated holders before using them for memories or consequences."),
	"scene-presence": $("Scene Presence", "Project whether one actor is present, absent, or unresolved in checked scene participation data.", "Choose the actor identity and connect checked Cast Data.", "Connect exact live Presence to Actor Context or another authorized actor path."),
	"character-direction": $("Character Direction", "Ask for private writing direction using one present actor’s authorized character and memory context.", "Choose the actor and connect its exact live Presence plus optional compatible Data.", "Write a separate system prompt and set the completion limit.", "Feed live Guidance only into a compatible generation path for that actor."),
	"parse-effect-library": $("Effect Library", "Check an authored effect list with stable identities, weights, and fixed or generated branches.", "Choose Data, JSON Text, or a plain-text list and connect that input.", "Set library, revision, and item identities plus the mechanical policy.", "Inspect the checked Library before connecting it to Random Pick."),
	"random-pick": $("Random Pick", "Draw a stable effect for a confirmed action and reuse that outcome on retries.", "Connect confirmed actual Events and a checked Effect Library, with saved outcomes when available.", "Choose Reuse for stable retries or deliberately author an explicit reroll identity.", "Route fixed outcomes to Stage Outcome and generated selections through Effect Author."),
	"commit-outcomes": $("Outcome Commit", "Stage resolved outcomes in an authorized JSON ledger for acceptance with the reviewed root result.", "Select an authorized outcomes data source and connect resolved Outcomes in Response.", "Inspect the receipt, then apply the reviewed root result to persist the accepted outcomes."),
	"saved-outcome": $("Saved Outcome", "Retrieve a checked outcome already recorded for an event without drawing again.", "Connect the Event and its saved outcome ledger Data.", "Inspect the matching result and route it onward; a missing saved result does not request a draw."),
	"effect-author": $("Effect Author", "Ask a model to describe the generated branch of an already selected random outcome.", "Connect a selected generated Outcome and optional supporting Data.", "Write bounded instructions and set the completion limit.", "Check mechanical novelty with a separate decision before Stage Outcome."),
	"stage-outcome": $("Stage Outcome", "Resolve a fixed effect or a generated proposal after explicit acceptance of its novelty.", "Connect the Outcome and, for generated effects, explicit Novelty decision Data.", "Inspect the resolved result, then connect it to Outcome Commit when it should be saved."),
	collection: $("Collection", "Look up, filter, count, sum, project, flatten, merge, or threshold explicit structured data.", "Connect Data and choose the collection mode you need.", "Set collection and field paths plus the matching, missing-value, or merge policies for that mode.", "Connect Other or Match when needed and inspect the resulting Data."),
	recall: $("Recall", "Select whole stored memory records for an authorized actor and present private guidance for a generation.", "Choose actor, memory set, and reply target, then connect authorized records and exact live Presence.", "Choose manual queue or an automatic activation mode and set filters and budgets.", "Queue matching memories when needed and connect Guidance to the appropriate generation path."),
	"hotkey-arm": $("Recall Shortcut", "Configure a keyboard shortcut and queue policy for a matching actor’s Recall node.", "Match the actor and memory set to Recall, then choose generation target and repetition policy.", "Set a unique physical key combination and when the queue is consumed.", "Use Queue recall or Cancel recall in Details or the context menu; previewing does not queue it."),
	"context-join": $("Context Join", "Combine ordered Context inputs while checking duplicate message identities and reporting omissions.", "Define between two and sixteen input slots with stable IDs and readable labels.", "Connect every slot to a Context source.", "Inspect retained and duplicate material, especially when joining a compacted branch."),
	note: $("Note", "Keep a written reminder or explanation beside the workflow without affecting execution.", "Write the explanation in the note’s text editor.", "Move and resize the note beside the nodes it describes."),
	comment: $("Comment", "Group nearby nodes visually and explain the purpose of that part of the workflow.", "Write a short label or explanation for the group.", "Resize and position the comment around the related nodes; its frame does not change their execution."),
	subgraph: $("Subgraph", "Group any ordinary workflow nodes into a reusable process with named inputs, outputs, and exposed settings.", "Connect the wrapper’s interface pins and set any exposed parameter or model overrides.", "Open the body to inspect its process; use Make editable copy when private edits are needed.", "Choose Add to Subgraphs to save a reusable definition or update a shelf entry."),
	"subgraph-input": $("Subgraph Input", "Bring one typed input from a subgraph’s outer interface into its body.", "Set the interface name, value type, and whether the parent must supply it.", "Connect the boundary’s Output to matching inputs inside the subgraph."),
	"subgraph-output": $("Subgraph Output", "Return one typed result from the subgraph body through its outer interface.", "Set the interface name, value type, and required setting.", "Connect a matching body result to the boundary’s Input and use the wrapper’s output in the parent.")
}, zl = Object.freeze(Object.fromEntries(Object.entries(Rl).map(([e, t]) => [e, Object.freeze({
	key: e,
	...t,
	howTo: Object.freeze(t.howTo)
})]))), Bl = "Caps the tokens the model may return in this node’s request. This is separate from the size of its input or downstream guidance.", Vl = "Exact phrases that must survive proposed edits unchanged. Add one phrase per line; missing or removed protected wording stops the change.", Hl = "Authorized follows the Draft’s permitted spans; Whole uses its permitted full text; Narration excludes quoted dialogue; Dialogue uses paired double-quoted speech.", Ul = "Text accepts ordinary text and returns Text in either stage. Draft accepts a frozen reply in Response and returns proposed Patches for validation and review.", Wl = "Text uses an example passage; Data uses structured reference material. Changing this choice changes the Reference input’s type.", Gl = "Light asks for restrained changes; Balanced allows broader changes within the selected scope. Both still require the same protection and review.", Kl = "Choose the exact connected value type: Context for conversation material, Draft for a frozen reply, Patches for edits, Candidate for a validated revision, Guidance for direction, Text for plain text, or Data for structured values.", ql = "Declare one to sixteen unique slot IDs, labels, and required flags in order. Required contributions must complete; optional skipped branches may be omitted.", Jl = "Player message watches the actual player turn; Draft watches reply narrative; Scene context watches supplied scene material; Accepted event watches confirmed event evidence.", Yl = "The canonical actor identity for this path. It must match supplied presence and private evidence; an invented label cannot grant access to another actor.", Xl = "JSON writes structured JSON; JSON Lines writes one record per line; CSV writes declared columns; Text and Markdown write serialized text using the separator policy.", Zl = "Optional supported validation schema entered as raw JSON. Blank skips schema checking; unsupported keywords or mismatched records stop the operation.", Ql = "Ordered CSV field names used to read or serialize records. Supply explicit columns when the document requires a fixed CSV layout.", $l = {
	mode: "Append joins Text or Markdown; Add appends records; Add unique avoids duplicate identities; Upsert inserts or updates by identity; Update fields changes only listed fields in existing records; Replace validates a complete replacement. JSON Lines and CSV support Add and Replace.",
	collectionPath: "JSON Pointer to the collection being changed, such as /memories. Blank addresses the document root. This differs from a Collection node’s array-of-keys path.",
	missingPath: "Error stops when the addressed collection is missing. Create permits creating the missing collection for a supported mutation.",
	key: "Record field that provides a stable identity for Add unique, Upsert, and Update fields. Matching identities must be explicit in the supplied records.",
	fieldPolicy: "Merge keeps existing fields and overlays the supplied fields during Upsert. Replace substitutes the whole matching record.",
	fields: "Names of existing-record fields that Update fields may change. Unlisted fields remain unchanged; this mode does not create new records.",
	schema: Zl,
	columns: Ql,
	separator: "Text inserted between the existing content and appended text, or between serialized text records. Choose the exact spacing or newline you want.",
	emptyPolicy: "Omit leaves out the joining separator when the destination is empty. Include adds it even at the beginning of an empty destination.",
	trailingSeparator: "Add the chosen separator after the final serialized or appended text value when enabled."
}, eu = {
	actorScope: "Selected uses the native host’s selected actor. Presence requires exact live Presence for the configured actor and adds a required Presence input.",
	actorId: "Actor identity used by Presence scope. Match it to the connected live Presence; Selected scope uses the host actor and leaves this blank."
}, tu = {
	actorId: Yl,
	memorySetId: "Stable identity of the memory set to recall. Recall and its shortcut must use the same actor and memory-set identities.",
	target: "Reply applies to an ordinary generated reply; Generated swipe applies to a new swipe; Both applies to either generation type."
}, nu = {
	subgraph: { enabled: "Enable this System to run its body. Disabling it skips its outputs without running contained nodes; optional consumers may omit the contribution or use saved text, while required consumers stop." },
	note: {
		title: "Optional heading for this note. Use a short label that explains the reminder or instruction.",
		content: "Written text displayed in the note. Use it for reminders, explanations, or instructions for people reading the canvas."
	},
	comment: {
		title: "Heading displayed on the comment frame. Use it to name the group of nodes or its purpose.",
		content: "Written explanation displayed in the comment frame. It describes the group without changing workflow execution.",
		moveContents: "Move the contained nodes along with the comment frame when enabled. Turn it off to reposition the frame without moving its nodes."
	},
	"scene-context": {
		recentMessages: "Maximum number of recent conversation messages to include in the Context window.",
		includeCharacter: "Include available selected-character fields as well as messages when enabled.",
		visibilityMode: "Actor returns the selected-character perspective. Public removes restricted messages and card material before budgeting. Actor mode alone does not grant private actor authority."
	},
	"smart-compactor": {
		targetTokens: "Target token budget for the resulting Context, including material kept verbatim. Protected material that exceeds the target stops compaction.",
		purpose: "Explain what the reduced context should support, such as planning the next scene or preserving an investigation’s clues.",
		method: "Select removes older flexible messages without a model. Compress may ask a model for one summary when needed and marks it as derived material.",
		keepRecent: "Number of newest messages to retain word for word rather than remove or summarize.",
		pins: "Case-sensitive exact phrases whose containing messages must stay word for word. Missing pins stop compaction.",
		maxTokens: Bl
	},
	"response-plan": {
		instructions: "Describe the writing direction, constraints, or possible next beats you want the model to plan. Suggested events remain proposals.",
		maxTokens: Bl
	},
	"pattern-scan": {
		mode: "Literal matches the authored text patterns directly; this scan does not infer meaning or ask a model.",
		scope: "Whole scans all text; Narration scans outside paired double quotes; Dialogue scans inside paired straight or curly double quotes. Unmatched quotes stop a scoped scan.",
		caseSensitive: "Require the same uppercase and lowercase letters as the pattern when enabled.",
		rules: "Literal phrases or authored rule records to find in the Draft. Findings identify matching text rather than changing it.",
		exemptions: "Literal exceptions that keep matching text out of the findings, for example wording allowed in this scene.",
		protectedLiterals: "Exact wording to preserve and exclude from editable findings. Add one protected phrase per line."
	},
	repair: {
		mode: "Repair asks for JSON patches to selected spans. Scan makes no repair request. Inspect reports cleanup findings without a model. Contextual cleanup asks for context-aware prose cleanup. Strict avoidance asks for prose that avoids the selected policies. The last two may make one request.",
		scope: Hl,
		categories: "Choose the built-in prose-policy categories to inspect or avoid. An empty list selects the full available policy; scope and protected wording remain separate choices.",
		caseSensitive: "Require matching uppercase and lowercase letters when finding policy phrases in cleanup modes.",
		strength: Gl,
		instructions: "Give the repair or cleanup model specific editorial directions within the selected scope. These instructions do not authorize changes to protected wording.",
		maxTokens: Bl,
		protectedLiterals: Vl
	},
	guidance: { budgetTokens: "Maximum token budget for the exposed writing direction. Guidance that exceeds the budget stops rather than being silently cut." },
	reroute: { artifactKind: Kl },
	compose: {
		mode: "Join combines sections from top to bottom. Template fills named placeholders in your own layout; unused sections are not added automatically.",
		outputKind: "Text feeds ordinary Text inputs and works in either stage. Guidance supplies instructions for Generate Reply and is available only in Preparation.",
		sections: "Each section has a unique Name, saved Text, and a Text or Guidance input type. A connected value replaces the saved text, including a completed empty value. Required sections stop when missing or skipped. Optional unconnected sections use saved text; when a connected source is skipped, choose saved-text fallback or omit. Unresolved connected sources stop Compose. Names start with a letter or underscore and use letters, digits, and underscores. Add, remove, or reorder sections, then choose Save Sections. Edit JSON edits the same list.",
		budgetTokens: "Maximum token budget for the complete rendered output. Zero leaves Compose without its own token limit; a positive budget stops output that exceeds it instead of truncating sections.",
		separator: "In Join mode, this text goes between sections. The default is a blank line. Find it in the Output settings group.",
		template: "In Template mode, write the layout with {{section:Direction}} for a named section and {{data:/tone}} for a connected Data field. Nested paths work; {{data:}} inserts the whole value. Missing names or fields stop Compose. Write {{{{ for literal {{; placeholders do not run scripts or host macros."
	},
	"text-rules": {
		inputKind: "Text accepts and returns ordinary Text in either stage. Draft accepts a frozen reply in Response; Replace proposes Patches and Extract returns Text.",
		mode: "Replace applies authored replacements in order. Extract collects matched text into a Text result using the separator.",
		rules: "Ordered rules with kind, pattern, optional replacement, and flags. Literal matches exact wording; Regex uses a regular expression. Literal flags allow i/u; Regex also allows m/s. Save Rules before running.",
		separator: "Text placed between extracted matches. It affects Extract output rather than replacement wording.",
		scope: Hl,
		protectedLiterals: Vl
	},
	"json-decode": {
		mode: "Parse turns raw JSON Text into Data. Check accepts existing Data and validates it without parsing text. Markdown fences are not raw JSON.",
		schema: Zl
	},
	"select-fields": { fields: "Map each unique output name to a path of keys or numeric array indices. Fields are required by default; required:false permits omission or an authored default. Save Fields before running." },
	"style-transfer": {
		inputKind: Ul,
		referenceKind: Wl,
		mode: "Narration transfers narrative style; Character voice transfers speech style; Rhythm transfers pacing; Register transfers formality or diction. Choose the text scope separately.",
		scope: Hl,
		protectedLiterals: Vl,
		strength: Gl,
		instructions: "Describe the stylistic qualities to borrow from the reference while preserving the supplied content and selected scope.",
		maxTokens: Bl
	},
	"format-transfer": {
		inputKind: Ul,
		referenceKind: Wl,
		scope: Hl,
		protectedLiterals: Vl,
		strength: Gl,
		instructions: "Describe the organization or format to borrow. The reference can require existing content but cannot supply new story facts.",
		maxTokens: Bl
	},
	"terminology-map": {
		inputKind: Ul,
		scope: Hl,
		protectedLiterals: Vl,
		caseSensitive: "Require each glossary entry’s uppercase and lowercase letters to match exactly when enabled.",
		match: "Word replaces complete words at Unicode boundaries. Phrase replaces the literal phrase. Replacements happen together and do not cascade into another glossary entry."
	},
	reflect: {
		mode: "Character considers beliefs, goals, relationships, and conflicts. Recall connects supplied episodes to current evidence. Scene considers conditions, opportunities, pressures, and attention.",
		instructions: "Tell the model which supported questions to assess. Keep observations, interpretations, and possibilities distinct.",
		maxTokens: Bl
	},
	internalize: {
		mode: "Experience proposes supported experience updates. Pattern considers supported recurrence. Recovery considers temporary conditions while retaining guarded beliefs and unresolved consequences.",
		instructions: "Describe the kinds of supported updates to consider from the connected settled events. Enduring traits cannot be rewritten.",
		maxTokens: Bl
	},
	express: {
		mode: "Behavior renders behavior hints as Guidance without a model. Attention renders attention hints as Guidance. Inner voice asks a model for fictional Text and changes the output type.",
		instructions: "Direct how the reflection should be expressed. Inner Voice is authored characterization, not access to a model’s private reasoning.",
		maxTokens: "Completion token cap for Inner Voice’s model request. Behavior and Attention are deterministic and make no model request."
	},
	context: {
		mode: "Assemble joins ordered Context inputs. Perspective retains messages explicitly visible to the chosen actor. Focus selects or compresses Context to a target size.",
		inputCount: "Number of required Context inputs in Assemble, from two to sixteen. Every declared input must be connected.",
		actorId: "Actor whose explicit visibility labels Perspective reads. The default character resolves to the active host actor; unmarked messages are omitted.",
		method: "Select removes older flexible material without a model. Compress may request one summary when needed while retaining protected material.",
		targetTokens: "Target token budget for the focused Context. Protected material that cannot fit stops the operation.",
		maxTokens: "Completion token cap for Focus compression. Select does not request a model.",
		keepRecent: "Number of most recent messages Focus must retain word for word.",
		pins: "Case-sensitive exact phrases whose containing messages Focus must retain word for word. Missing pins stop the operation.",
		purpose: "Explain what the focused Context will be used for so a compression request can prioritize relevant material."
	},
	memory: {
		mode: "Read returns stored State, Events, or Episodes. Recall finds bounded stored episodes. Commit stages a state proposal in Response and has no output pin.",
		view: "State returns the current actor-state snapshot; Events returns stored settled events; Episodes returns stored experience records.",
		query: "Search text for selecting stored episodes in Recall mode; it does not ask a model to invent memories.",
		limit: "Maximum number of stored episodes returned by Recall, from one to sixty-four.",
		idempotencyKey: "Identity of one intended commit. The default lets the host derive it from this graph and exact proposal. Reusing a custom key with changed content fails."
	},
	state: {
		mode: "Value reads state or proposes authored values. Curve advances a recovery curve. Track counts distinct settled events. Progression applies connected numeric rules to confirmed events. Time-decay moves temporary values toward a baseline using elapsed story minutes. These modes calculate; they do not save state.",
		updates: "JSON object of named numeric values, such as {\"trust\":0.35}. Omit values to return the current snapshot. Arrays are not accepted.",
		min: "Smallest permitted numeric value for authored Value updates. Fractional bounds are allowed.",
		max: "Largest permitted numeric value for authored Value updates. Fractional bounds are allowed.",
		curveId: "Stable identity of the recovery curve to advance in the supplied state.",
		steps: "Number of recovery-curve steps to advance in this run, from one to sixty-four.",
		decay: "Fraction from zero to one controlling how the recovery curve moves toward its baseline. Fractional values are supported.",
		baseline: "Finite numeric resting value toward which the recovery curve returns.",
		durations: "JSON object with positive integer durations from one to sixty-four for onset, peak, plateau, decline, and aftermath. Save the object before running.",
		trackId: "Stable identity of the event counter. Only distinct settled event IDs advance it; repeated IDs do not."
	},
	text: { text: "Literal multiline text saved in the node. It is returned unchanged, without host macro expansion; empty text is valid." },
	"file-input": {
		fileName: "Name of the imported text file saved with this node. Use Choose file or Replace file to load its contents.",
		content: "Imported UTF-8 text saved as a snapshot in the workflow. Execution uses this snapshot until you explicitly replace the file.",
		loaded: "Shows whether a file snapshot has been imported. An empty loaded file is valid; an unloaded node cannot run."
	},
	"prompt-source": {
		source: "System reads the enabled system template with supported host overrides. Prompt entry reads a configured Prompt Manager entry by its stable ID.",
		promptId: "Stable Prompt Manager entry ID used when Source is Prompt entry. Select an enabled configured entry rather than its visible label.",
		form: "Raw preserves the configured template. Resolved expands supported pure name and formatting macros such as {{char}}, {{user}}, and {{newline}}. Use Raw for JSON braces or broader macros; unsupported or state-changing macros fail in Resolved."
	},
	condition: {
		path: "Array of keys locating the Data value to compare. An empty path selects the whole connected value.",
		operator: "Equals and Not equals compare explicit values; Exists checks that the path is present; Nonempty checks strings, arrays, or objects; Greater than, At least, and Less than compare finite numbers.",
		value: "Explicit value used by the comparison. Match the connected value’s type; ordered comparisons require a finite number. Exists and Nonempty do not need a comparison value."
	},
	branch: { artifactKind: Kl },
	join: {
		artifactKind: Kl,
		inputs: ql,
		selection: "First returns the first completed contribution in declared slot order. Last returns the last completed contribution. This is slot order, not completion time."
	},
	collect: {
		artifactKind: Kl,
		inputs: ql
	},
	"confidence-gate": {
		metricPath: "Array of keys selecting a finite numeric metric from Data. Empty selects the whole value. Booleans are not numeric scores.",
		acceptMin: "Acceptance threshold: with Higher, scores at or above it pass; with Lower, scores at or below it pass. Keep it separate from rejection.",
		rejectMax: "Rejection threshold: with Higher, scores at or below it fail; with Lower, scores at or above it fail. Scores between thresholds remain unresolved.",
		direction: "Higher prefers larger scores; Lower prefers smaller scores. Arrange the acceptance and rejection thresholds for that direction without overlap."
	},
	"for-each": {
		helper: "Exact saved helper identity, version, and content hash. Choose a pinned Data item/result helper in Configure node before running.",
		limit: "Maximum number of items processed, from one to 128. An oversized collection stops before partially running its helper.",
		requestBoundPerIteration: "Maximum helper model requests per item, from zero to sixteen. This multiplied by Limit is the total authored request bound.",
		mode: "Map processes each item in order into results. Projected-state also requires explicit State and carries the projected state from one iteration to the next.",
		roleOverrides: "Profile or custom-model selectors for the helper’s actual text roles, including nested roles. Explicit helper-node choices take precedence; check the displayed affected calls."
	},
	decision: {
		inputKind: "Data judges structured values; Text judges supplied text. Changing this choice changes the evidence input’s type.",
		questions: "JSON object of stable question IDs and instructions. Use yes/no, explicit choices, or ordered scores. Unresolved answers remain null; confidence is the model’s own estimate.",
		maxTokens: Bl
	},
	combine: {
		mode: "Append adds the connected text as a named Draft section while retaining the original narrative body.",
		sectionId: "Stable identity of the appended section. Reusing the same identity replaces that section instead of accumulating duplicate notes.",
		separator: "Text placed between the Draft body and appended sections when the Draft is assembled. The default is a blank line."
	},
	append: {
		sectionId: "Stable identity of the appended section. Reusing the same identity replaces that section instead of accumulating duplicate notes.",
		separator: "Text placed between the Draft body and appended sections when the Draft is assembled. The default is a blank line."
	},
	"render-notes": {
		title: "Visible heading for the notes presentation, such as Scene notes.",
		format: "HTML presents escaped public notes in a disclosure element. Text presents them as ordinary plain text."
	},
	enrich: {
		instructions: "Tell the model what additional supported details to add to the supplied Data. Declared identities must remain intact.",
		maxTokens: Bl
	},
	"draft-text": { view: "Body returns only the original narrative text. Assembled includes appended sections in their visible order." },
	extract: {
		inputKind: "Draft extracts from a frozen reply in Response. Text extracts from ordinary Text in either stage.",
		mode: "Model asks for records using instructions and optional schema. Literal extracts records using authored patterns without a model.",
		instructions: "Describe the records and evidence the model should extract. Extraction produces candidates, not confirmed events.",
		schema: "Optional supported schema for extracted records, entered as raw JSON. Invalid or mismatched output stops extraction.",
		patterns: "Saved literal extraction pattern records used in Literal mode. They specify what to match and how to form the extracted records.",
		maxTokens: Bl
	},
	"model-call": {
		instructions: "Describe the auxiliary task to perform using the connected Text and optional Context or Data.",
		outputKind: "Text returns the model’s text. Data requests structured JSON and checks it against any supplied schema.",
		schema: "Optional supported raw JSON schema for Data output. It constrains structured output rather than turning arbitrary prose into records.",
		maxTokens: Bl
	},
	"revise-draft": {
		instructions: "Describe the intended revision to the owned Draft. The model must keep source identity, protected wording, and permitted scope.",
		scope: Hl,
		protectedLiterals: Vl,
		maxTokens: Bl
	},
	"generate-reply": { budgetTokens: "Maximum tokens of optional Guidance supplied to this native generation. The reply itself uses SillyTavern’s generation settings." },
	format: {
		inputMode: "Records accepts structured Data. JSON text accepts raw JSON Text and parses it before validation and serialization.",
		format: Xl,
		jsonShape: "Records writes a JSON array of records. Single writes one object and requires exactly one object in the supplied records.",
		mapping: "Preserve keeps record fields. Select creates records using the declared field mappings.",
		fields: "Authored output names and input paths used by Select field mapping. They select explicit values rather than infer fields from prose.",
		schema: Zl,
		columns: Ql,
		separator: "Text placed between serialized Text or Markdown records. Other formats use their own structural delimiters.",
		trailingSeparator: "Add the chosen separator after the last Text or Markdown record when enabled."
	},
	"read-file": {
		targetId: "Authorized workflow data source to read in the active user and chat. Configure sources in Workflow Data; this is a logical identity, not an OS file path.",
		schema: Zl,
		columns: Ql,
		...eu
	},
	"write-file": {
		...$l,
		...eu
	},
	"project-document": {
		...$l,
		format: Xl
	},
	"story-clock": {
		clockId: "Authorized accepted-clock data source identity. Its JSON must contain a valid calendar, absolute minute, revision, and day length.",
		calendarId: "Optional expected calendar identity. When supplied, a clock belonging to another calendar stops the operation."
	},
	"time-trigger": {
		mode: "Daily fires at a minute within each story day. Interval fires every fixed number of minutes from an origin. Delay fires once at an absolute story minute.",
		scheduleId: "Stable identity of this authored schedule. It identifies its occurrences together with schedule revision and due minute.",
		scheduleRevision: "Positive revision number for this schedule. Change it deliberately when the schedule definition changes.",
		clockId: "Optional expected clock identity. The connected previous and destination clocks must agree with it when supplied.",
		calendarId: "Optional expected calendar identity. The connected clocks must agree with it when supplied.",
		minuteOfDay: "Daily due minute counted from midnight: 0 is 00:00 and 840 is 14:00. It must fit the connected calendar’s day length.",
		anchorMinute: "Absolute story minute from which Interval repeats are measured.",
		intervalMinutes: "Positive number of story minutes between Interval occurrences. For example, 480 is eight hours.",
		dueMinute: "Absolute story minute for the one-time Delay occurrence.",
		order: "Order of this schedule’s occurrence when multiple schedules are due at the same minute. Lower values come first.",
		metadata: "Authored subject, visibility, and consequence Data to retain with the occurrence. Use dedicated controls for schedule identity and timing.",
		limit: "Maximum due occurrences to enumerate. Exceeding the limit holds the whole time projection rather than returning a partial list.",
		consumedIds: "Occurrence IDs already settled, so they are not emitted again. Supply authored IDs or the matching connected input."
	},
	"advance-time": {
		policy: "Interrupt stops at the earliest due event and retains unprocessed duration in Remainder. Catch-up enumerates due events across the full proposed movement within the limit.",
		schedules: "Authored schedule records used to find due events. Supply schedules here or through the Schedules input, not both.",
		limit: "Maximum due occurrences in this projection. Overflow stops the whole projection before partial clock movement can be accepted.",
		consumedIds: "Already settled occurrence IDs to exclude from this projection. The matching input can supply the retained set."
	},
	"actor-context": { actorId: Yl },
	"event-normalize": {
		mode: "Candidates checks candidate occurrences against exact source text and authored entities. Progression converts confirmed events to occurrence Data for State rules.",
		eventType: "Optional authored event type assigned to resulting Progression occurrences. Leave blank to retain each confirmed event’s type. Candidates mode uses the supplied candidate types.",
		absoluteMinute: "Optional exact story minute, with -1 meaning unspecified. When a Clock is connected, its timestamp must agree with an authored minute."
	},
	"prompted-memory": {
		actorId: Yl,
		mode: "Recall searches authorized existing memories. Create proposes a new memory. Recall-or-create recalls first and may propose one when needed; creation also needs Allow create.",
		prompt: "Describe what memory to recall or propose for the supplied genuine holder event. Only this actor’s authorized memories are read.",
		allowCreate: "Explicitly permit proposing a new memory. Creation remains a proposal and requires a separate authorized persistence path.",
		maxTokens: Bl
	},
	"item-mention-trigger": {
		actorId: Yl,
		itemId: "Canonical item identity to watch in the supplied Entities. A textual alias does not establish who holds or uses the item.",
		aliases: "One to thirty-two literal names or phrases to match for this item, one per line.",
		watch: Jl,
		activation: "Per occurrence returns each matching occurrence. Once per source activates once for a source revision. Edge once activates on a new matching edge using the connected prior trigger state.",
		caseSensitive: "Require aliases to match the source’s uppercase and lowercase letters when enabled."
	},
	"item-use-trigger": {
		itemId: "Canonical item identity to check against supplied Entities and exact source evidence.",
		mode: "Candidates checks connected candidate Data without a model. Extract makes one bounded model request to identify candidate uses and their evidence.",
		watch: Jl,
		instructions: "Tell extraction which actual item-use evidence to identify. Proposed, negated, or hypothetical use remains distinct from actual candidates.",
		maxTokens: Bl
	},
	"confirm-events": { mode: "Records matches each occurrence with its decision record. Single gate applies one explicit accepted result to a bounded single event. Both retain source and identity checks." },
	"scene-presence": { actorId: Yl },
	"character-direction": {
		actorId: Yl,
		systemPrompt: "Separate system instructions for this actor’s writing-direction request. Its authorized card, context, and memories supply the actor background.",
		maxTokens: Bl
	},
	"parse-effect-library": {
		format: "Data reads structured library Data. JSON parses raw JSON Text. Text parses a plain-text list into checked effect entries.",
		libraryId: "Stable identity of this effect library, used to retain the meaning of later draws and saved outcomes.",
		revision: "Explicit library revision identity. Change it when the authored effect library changes.",
		itemId: "Canonical item identity to which this effect library belongs.",
		mechanicalPolicy: "Narrative only permits descriptive effects. Require mechanics requires each fixed entry to declare spell outcome, duration, and consequence; generated branches delegate invention downstream."
	},
	"random-pick": {
		rerollPolicy: "Reuse retains the same outcome for the same event and library on retries. Explicit permits a deliberately authored reroll with a Reroll ID.",
		rerollId: "Deliberate identity of this requested reroll, required by Explicit policy. Change it only when you intend another draw.",
		ledgerId: "Optional outcomes-ledger identity used to associate the stable selection with saved outcomes."
	},
	"commit-outcomes": { targetId: "Authorized JSON outcomes source to stage the resolved results into. The write settles only with the exact accepted root result." },
	"effect-author": {
		instructions: "Describe the bounded effect to invent for the already selected generated branch. Actor, item, and cast identities stay fixed.",
		maxTokens: Bl
	},
	collection: {
		mode: "Lookup returns one unambiguous match; Filter returns matching records; Count returns array length; Sum totals a numeric field; Threshold reports crossed values; Merge combines ordered arrays; Rule lookup matches authored rules; Project selects one field from each record; Flatten removes one array level.",
		collectionPath: "Array of keys locating the collection within Data. Empty uses the whole value; Rule lookup defaults to a rules collection when available.",
		fieldPath: "Array of keys locating the field to compare, sum, or project within each record. Rule lookup defaults to eventType.",
		value: "Literal comparison value for lookup or filtering. Connected Match Data replaces this literal and can supply a typed numeric or structured value.",
		operator: "Equals and Not equals compare explicit values; At least and At most compare finite numbers; Contains checks text or array membership; Exists checks that the field is present.",
		missingPolicy: "Hold stops on a missing field. Exclude omits that record. Include retains it for lookup/filter, or inserts null for a missing Project field.",
		thresholds: "JSON array of authored numeric thresholds to test against explicit before and after Data in Threshold mode.",
		mergePolicy: "Keep all retains both collections in order. Add unique keeps one copy per identity and stops if the same identity has conflicting content.",
		identityPath: "Array of keys locating each record’s stable scalar identity for Add unique merging, such as [\"id\"]."
	},
	recall: {
		...tu,
		activation: "Manual queue requires a queued recall. Keyword matches supplied source text; Event matches genuine confirmed occurrences for this actor; Character activates when the configured actor is present in supplied scene participation. Manual queue or Keyword, Event, or Character accepts either the queue or that automatic trigger.",
		keywords: "Literal keywords used by keyword activation modes, one per line. Connect the checked source being watched.",
		caseSensitive: "Require keyword matches to use the same uppercase and lowercase letters when enabled.",
		eventTypes: "Canonical event types used to select memories for event activation. Genuine confirmed occurrences must be connected.",
		partnerIds: "Actor identities that must all appear in a stored record’s partner list for that record to be selected. This filter does not establish anyone’s current scene presence.",
		tags: "Stored record tags used to filter the memory selection, one per line.",
		recordIds: "Explicit stored memory record IDs to include, one per line. Selected records retain their genuine read source.",
		limit: "Maximum number of whole memory records selected, from one to sixty-four.",
		maxCharacters: "Character budget for selected whole records. Records are retained whole rather than silently cut.",
		maxTokens: "Token budget for the private recalled Guidance. Recall makes no model request.",
		title: "Heading used to identify the recalled-memory guidance and report."
	},
	"hotkey-arm": {
		...tu,
		uses: "Next matching generation consumes one matching use. Once for each generation type allows one reply and one generated swipe. Until cancelled keeps the queue active until explicitly cancelled.",
		consumeOn: "Successful completion consumes the queued use after a successful generation. Accepted result consumes it only after the reviewed result is accepted.",
		hotkey: "Physical keyboard code plus Ctrl, Alt, Shift, or Meta modifiers. Choose a unique combination; shortcuts skip typing, composition, and key-repeat events."
	},
	"context-join": { inputs: "Two to sixteen required Context slots with stable IDs and visible labels, joined in declared order. Connect every slot; identical messages deduplicate and conflicting identities stop the join." }
}, ru = {
	enabled: "Allow this node to participate in workflow execution when enabled. Disabled paths may leave downstream required inputs unavailable.",
	phase: "Preparation runs before Generate Reply; Response runs after it. The selected node’s input and output types must support that stage. Compose Text works in either; Compose Guidance requires Preparation.",
	stage: "Preparation runs before Generate Reply; Response runs after it. Choose a stage supported by this node’s operation and connected values.",
	alias: "Optional display name for this placed node. It changes the label you see without changing which operation runs.",
	compact: "Show a smaller card on the canvas while retaining the same settings and connections.",
	modelRole: "Job used to select this node’s model binding, such as Analysis or Prose. The effective binding shows which calls it affects.",
	profileId: "Choose a saved model profile or Active SillyTavern model. Inherit follows the enclosing binding; an explicit choice overrides it for this node.",
	model: "Optional model-name override within the chosen profile. Use the profile default when blank; Block explicitly prevents inheriting a model.",
	modelBinding: "Choose the model profile and optional model override for this node’s requests. Inherit follows the enclosing choice, Override sets this node’s choice, and Block prevents inheritance.",
	helperBindings: "Choose profiles or model overrides for the pinned helper’s actual text roles. Explicit choices inside the helper take precedence over outer role overrides.",
	modifiers: "Apply enabled text modifiers after this node’s ordinary Text output, in listed order. For example, trim whitespace or add a prefix; inspect the adjusted output.",
	workflowData: "Choose or configure the authorized logical data source used by this node. Its format, visibility, and actor scope must match the workflow path.",
	file: "Choose or replace a UTF-8 text file to save its filename and contents in this node. Execution uses the saved snapshot, including an empty imported file.",
	definition: "Exact reusable definition identity, version, and content hash pinned by this subgraph instance. Existing placed copies retain their saved process.",
	parameters: "Override settings explicitly exposed by the reusable definition. Unchanged parameters use the definition’s saved values.",
	bindings: "Role or node-specific model choices exposed by the subgraph. Inspect effective bindings to see which requests an override changes.",
	label: "Visible interface name shown on the boundary and its wrapper pin. Use a name that explains what the parent should supply or receive.",
	kind: Kl,
	required: "Require this interface contribution to be available. A missing required value holds execution rather than supplying a guessed default.",
	interfacePortId: "Stable identity of the boundary’s interface pin. Its visible label may change while connections keep using this identity.",
	text: "Written explanation displayed in the note or comment. It documents the canvas and makes no model request.",
	color: "Canvas color for the note or comment. Choose it to distinguish related explanations visually.",
	width: "Display width of the note or comment frame on the canvas.",
	height: "Display height of the note or comment frame on the canvas."
};
function iu(e, t) {
	if (!au(e) || typeof t != "string") return null;
	let n = nu[e];
	return n && Object.hasOwn(n, t) ? n[t] : Object.hasOwn(ru, t) ? ru[t] : null;
}
function au(e) {
	return typeof e == "string" && Object.hasOwn(zl, e) ? zl[e] : null;
}
//#endregion
//#region src/ui/node-guide.js
function ou(e) {
	if (!e) return null;
	let t = e.guideKey ?? e.operation, n = au(t);
	if (!n) return null;
	let r = e.controls.map((e) => ({
		key: e.key,
		label: e.label,
		description: iu(t, e.key) || e.help
	})), i = (e, t) => r.push({
		key: e,
		label: t,
		description: iu(n.key, e)
	});
	return e.fileInput && i("file", "Choose / replace file"), e.workflowData && i("workflowData", "Workflow Data"), e.boundary ? (i("label", "Port name"), i("kind", "Type"), i("required", "Required")) : (i("alias", "Node name"), i("compact", "Compact card"), (e.system || e.guideKey !== "note" && e.guideKey !== "subgraph") && i("enabled", e.system ? "Run this system" : "Enabled"), e.guideKey === "subgraph" && (i("definition", "Pinned definition"), i("parameters", "Exposed settings"), i("bindings", "Model bindings")), e.guideKey === "note" && i("content", "Notes")), e.phaseEditable && i("phase", "Workflow stage"), e.model && (i("profileId", "Connection"), i("model", "Model override"), i("modelRole", "Model role")), e.helperBindings && i("helperBindings", "Helper model connections"), e.modifiers && i("modifiers", "Text modifiers"), {
		...n,
		card: e.guideCard ?? null,
		settings: r
	};
}
function su(e) {
	let t = au("comment");
	return t ? {
		...t,
		card: null,
		comment: e,
		settings: [
			"title",
			"content",
			"color",
			"moveContents"
		].map((e) => ({
			key: e,
			label: {
				title: "Title",
				content: "Notes",
				color: "Color",
				moveContents: "Move contents"
			}[e],
			description: iu("comment", e)
		}))
	} : null;
}
//#endregion
//#region ui/CommentDetails.svelte
var cu = /* @__PURE__ */ G("<button type=\"button\" class=\"pc-comment-help svelte-17djc3u\" aria-label=\"Open Comment guide\" title=\"Help with Comment\">?</button>"), lu = /* @__PURE__ */ G("<p class=\"pc-detail-meta svelte-17djc3u\">Read-only comment</p>"), uu = /* @__PURE__ */ G("<section class=\"pc-comment-details svelte-17djc3u\" aria-label=\"Comment details\"><header class=\"svelte-17djc3u\"><h3 class=\"svelte-17djc3u\">Comment</h3><!></header> <!> <fieldset class=\"pc-detail-group svelte-17djc3u\"><legend class=\"svelte-17djc3u\">Comment</legend> <label class=\"svelte-17djc3u\">Title<input aria-label=\"Comment title\" class=\"svelte-17djc3u\"/></label> <label class=\"svelte-17djc3u\">Notes<textarea aria-label=\"Comment notes\" rows=\"5\" class=\"svelte-17djc3u\"></textarea></label> <label class=\"pc-comment-color-label svelte-17djc3u\">Color<input aria-label=\"Comment color\" type=\"color\" class=\"svelte-17djc3u\"/></label> <label class=\"pc-detail-check svelte-17djc3u\"><input aria-label=\"Move contents\" type=\"checkbox\" class=\"svelte-17djc3u\"/> Move contents</label> <small class=\"svelte-17djc3u\">Moves fully contained nodes when you drag the comment header.</small></fieldset> <div class=\"pc-comment-commands svelte-17djc3u\"><button type=\"button\" class=\"pc-btn svelte-17djc3u\">Fit to contents</button> <button type=\"button\" class=\"pc-btn pc-danger svelte-17djc3u\">Delete comment</button></div> <small class=\"svelte-17djc3u\">Deleting this comment keeps its contents.</small></section>");
function du(e, t) {
	Ue(t, !0);
	let n = Pi(t, "readOnly", 3, !1), r = /* @__PURE__ */ F(() => n() || t.comment.readOnly), i = (e) => e.stopPropagation();
	function a(e) {
		H(r) || t.onPatch(e);
	}
	function o(e) {
		H(r) || t.onCommand(e);
	}
	var s = uu(), c = R(s), l = B(R(c)), u = (e) => {
		var n = cu();
		W("click", n, function(...e) {
			t.openGuide?.apply(this, e);
		}), K(e, n);
	};
	J(l, (e) => {
		t.openGuide && e(u);
	}), P(c);
	var d = B(c, 2), f = (e) => {
		K(e, lu());
	};
	J(d, (e) => {
		H(r) && e(f);
	});
	var p = B(d, 2), m = B(R(p), 2), h = B(R(m));
	X(h), P(m);
	var g = B(m, 2), _ = B(R(g));
	at(_), P(g);
	var v = B(g, 2), y = B(R(v));
	X(y), P(v);
	var b = B(v, 2), x = R(b);
	X(x), Me(), P(b), Me(2), P(p);
	var S = B(p, 2), C = R(S), w = B(C, 2);
	P(S), Me(2), P(s), V(() => {
		p.disabled = H(r), wi(h, t.comment.title), h.disabled = H(r), wi(_, t.comment.content), _.disabled = H(r), wi(y, t.comment.color), y.disabled = H(r), Ti(x, t.comment.moveContents), x.disabled = H(r), C.disabled = H(r), w.disabled = H(r);
	}), U("keydown", h, i, !0), W("change", h, (e) => a({ title: e.currentTarget.value })), U("keydown", _, i, !0), W("change", _, (e) => a({ content: e.currentTarget.value })), W("change", y, (e) => a({ color: e.currentTarget.value })), W("change", x, (e) => a({ moveContents: e.currentTarget.checked })), W("click", C, () => o("fit")), W("click", w, () => o("delete")), K(e, s), We();
}
Er(["click", "change"]);
//#endregion
//#region ui/OutputPreview.svelte
var fu = /* @__PURE__ */ G("<button type=\"button\" aria-label=\"Collapse preview\" title=\"Collapse preview\" class=\"svelte-ee2ehy\">▴</button>"), pu = /* @__PURE__ */ G("<button type=\"button\" role=\"tab\" class=\"svelte-ee2ehy\"> </button>"), mu = /* @__PURE__ */ G("<div class=\"pc-preview-tabs svelte-ee2ehy\" role=\"tablist\" aria-label=\"Recorded artifacts\"></div>"), hu = /* @__PURE__ */ G("<pre class=\"svelte-ee2ehy\"> </pre>"), gu = /* @__PURE__ */ G("<small class=\"pc-preview-note svelte-ee2ehy\"> </small>"), _u = /* @__PURE__ */ G("<div role=\"tabpanel\" tabindex=\"0\" class=\"svelte-ee2ehy\"><article class=\"svelte-ee2ehy\"><div class=\"pc-preview-section-heading svelte-ee2ehy\"><span class=\"svelte-ee2ehy\"> </span><small class=\"svelte-ee2ehy\"> </small></div> <!> <!></article></div>"), vu = /* @__PURE__ */ G("<p class=\"pc-preview-empty svelte-ee2ehy\"> </p>"), yu = /* @__PURE__ */ G("<p class=\"pc-preview-note svelte-ee2ehy\"> </p> <!>", 1), bu = /* @__PURE__ */ G("<section aria-label=\"Accepted consequences\" class=\"pc-preview-settlement svelte-ee2ehy\"><strong class=\"svelte-ee2ehy\"> </strong> <!></section>"), xu = /* @__PURE__ */ G("<p class=\"pc-preview-note svelte-ee2ehy\"> </p>"), Su = /* @__PURE__ */ G("<div class=\"pc-preview-note svelte-ee2ehy\"><span class=\"svelte-ee2ehy\"> </span><!></div>"), Cu = /* @__PURE__ */ G("<div class=\"svelte-ee2ehy\"><!></div>"), wu = /* @__PURE__ */ G("<button type=\"button\" data-run-here=\"\" title=\"Runs the selected output's dependencies within the displayed request limit.\" class=\"svelte-ee2ehy\"> </button><!>", 1), Tu = /* @__PURE__ */ G("<button type=\"button\" data-preview-apply=\"\" class=\"svelte-ee2ehy\"> </button><!><button type=\"button\" class=\"svelte-ee2ehy\"> </button>", 1), Eu = /* @__PURE__ */ G("<header class=\"svelte-ee2ehy\"><h3 class=\"svelte-ee2ehy\"> </h3> <div class=\"pc-preview-tools svelte-ee2ehy\"><button type=\"button\" aria-label=\"Pin preview\" class=\"svelte-ee2ehy\"> </button><!></div></header> <!> <div class=\"pc-preview-sections svelte-ee2ehy\"><!> <!> <!> <!> <!> <!> <!></div> <footer class=\"svelte-ee2ehy\"><span class=\"pc-preview-status svelte-ee2ehy\"> </span> <span class=\"svelte-ee2ehy\"> </span> <!> <!></footer>", 1), Du = /* @__PURE__ */ G("<p class=\"pc-preview-empty svelte-ee2ehy\">Select a node on the canvas to inspect its recorded result.</p>"), Ou = /* @__PURE__ */ G("<section class=\"pc-output-preview svelte-ee2ehy\" aria-label=\"Output preview\"><!></section>");
function ku(e, t) {
	let n = Rr();
	Ue(t, !0);
	let r = Pi(t, "actions", 19, () => ({})), i = /* @__PURE__ */ F(() => {
		let e = t.view?.diagnostics ?? lo([
			t.view?.runHere?.issue,
			...t.view?.issues ?? [],
			t.view?.review?.issue
		].filter((e) => !!e), { nodeTitle: t.view?.title });
		return e.filter((t, n) => e.findIndex((e) => e.id === t.id) === n);
	}), a = /* @__PURE__ */ F(() => JSON.stringify([t.view?.sourceKey, t.view?.selectedKey])), o = /* @__PURE__ */ I(tn({
		scope: "",
		id: null
	})), s = /* @__PURE__ */ F(() => (H(o).scope === H(a) ? t.view?.sections.find((e) => e.id === H(o).id) : null) ?? t.view?.sections[0] ?? null);
	Cn(() => {
		let e = H(o).scope === H(a) && t.view?.sections.some((e) => e.id === H(o).id) ? H(o).id : t.view?.sections[0]?.id ?? null;
		(H(o).scope !== H(a) || H(o).id !== e) && L(o, {
			scope: H(a),
			id: e
		}, !0);
	});
	let c = (e) => n + "-tab-" + encodeURIComponent(e);
	function l(e, n) {
		e.stopPropagation();
		let r = t.view?.sections ?? [];
		if (!r.length || ![
			"ArrowLeft",
			"ArrowRight",
			"Home",
			"End"
		].includes(e.key)) return;
		e.preventDefault();
		let i = e.key === "Home" ? 0 : e.key === "End" ? r.length - 1 : (n + (e.key === "ArrowRight" ? 1 : -1) + r.length) % r.length;
		L(o, {
			scope: H(a),
			id: r[i].id
		}, !0), e.currentTarget.parentElement?.querySelectorAll("[role=\"tab\"]")[i]?.focus();
	}
	let u = /* @__PURE__ */ F(() => t.view?.choices.find((e) => e.key === t.view?.selectedKey) ?? null), d = (e) => ({
		"not-run": "Not run",
		current: "Current",
		stale: "Stale",
		removed: "Source removed"
	})[e] ?? e, f = (e) => "kind" in e ? JSON.stringify([
		"terminal",
		e.address.workflowId,
		e.address.instancePath,
		e.address.nodeId
	]) : JSON.stringify([
		"output",
		e.workflowId,
		e.instancePath,
		e.nodeId,
		e.portId
	]), p = (e) => "kind" in e ? {
		kind: "terminal",
		address: {
			...e.address,
			instancePath: [...e.address.instancePath]
		}
	} : {
		...e,
		instancePath: [...e.instancePath]
	}, m = /* @__PURE__ */ F(() => !!(t.view && H(u) && t.view.status !== "removed" && !t.view.busy && t.view.runHere?.enabled && r().runHere)), h = /* @__PURE__ */ F(() => !!(t.view && H(u) && t.view.review?.mode === "root" && t.view.review.selectedRootTerminal && "kind" in H(u).target && f(H(u).target) === f(t.view.review.selector.terminal))), g = /* @__PURE__ */ F(() => !!(t.view && t.view.status === "current" && !t.view.busy && H(h) && t.view.review?.fresh && t.view.review.canApply && r().apply)), _ = /* @__PURE__ */ F(() => !!(t.view && !t.view.busy && H(h) && r().reject)), v = /* @__PURE__ */ F(() => H(m) ? void 0 : t.view?.runHere?.reason || (t.view?.busy ? "Wait for the current run to finish." : H(u) ? r().runHere ? "This output cannot run with the current workflow settings." : "Run to here is unavailable in this workspace." : "Select a node on the canvas before running.")), y = /* @__PURE__ */ F(() => H(g) ? void 0 : t.view?.review?.reason || (t.view?.busy ? "Wait for the current run to finish." : t.view?.status !== "current" || !t.view?.review?.fresh ? "Run this workflow again to review a current result." : H(h) ? r().apply ? "This reviewed reply cannot be applied with the current workflow settings." : "Apply is unavailable in this workspace." : "Select the root workflow’s reviewed reply to apply it.")), b = /* @__PURE__ */ F(() => H(i).findIndex((e) => e.message === H(v))), x = /* @__PURE__ */ F(() => H(i).findIndex((e) => e.message === H(y))), S = /* @__PURE__ */ F(() => H(v) ? n + (H(b) >= 0 ? "-diagnostic-" + H(b) : "-run-reason") : void 0), C = /* @__PURE__ */ F(() => H(y) ? n + (H(x) >= 0 ? "-diagnostic-" + H(x) : "-apply-reason") : void 0);
	function w(e) {
		let t = {
			kind: "terminal",
			address: {
				...e.terminal.address,
				instancePath: [...e.terminal.address.instancePath]
			}
		};
		return {
			handleId: e.handleId,
			runId: e.runId,
			terminal: t
		};
	}
	var T = Ou(), E = R(T), D = (e) => {
		var f = Eu(), h = z(f), T = R(h), E = R(T, !0);
		P(T);
		var D = B(T, 2), O = R(D), k = R(O, !0);
		P(O);
		var A = B(O), j = (e) => {
			var n = fu();
			W("click", n, function(...e) {
				t.collapse?.apply(this, e);
			}), K(e, n);
		};
		J(A, (e) => {
			t.collapse && e(j);
		}), P(D), P(h);
		var M = B(h, 2), ee = (e) => {
			var r = mu();
			Y(r, 23, () => t.view.sections, (e) => e.id, (e, t, r) => {
				var i = pu(), u = R(i, !0);
				P(i), V((e) => {
					Z(i, "id", e), Z(i, "aria-selected", H(s)?.id === H(t).id), Z(i, "aria-controls", n + "-panel"), Z(i, "tabindex", H(s)?.id === H(t).id ? 0 : -1), q(u, H(t).label);
				}, [() => c(H(t).id)]), W("click", i, () => {
					L(o, {
						scope: H(a),
						id: H(t).id
					}, !0);
				}), U("keydown", i, (e) => l(e, H(r)), !0), K(e, i);
			}), P(r), K(e, r);
		};
		J(M, (e) => {
			t.view.sections.length && e(ee);
		});
		var te = B(M, 2), ne = R(te), re = (e) => {
			let t = /* @__PURE__ */ F(() => H(s));
			var r = _u(), i = R(r), a = R(i), o = R(a), l = R(o, !0);
			P(o);
			var u = B(o), d = R(u, !0);
			P(u), P(a);
			var f = B(a, 2), p = (e) => {
				go(e, { get issue() {
					return H(t).text;
				} });
			}, m = (e) => {
				var n = hu(), r = R(n, !0);
				P(n), V(() => q(r, H(t).text)), K(e, n);
			};
			J(f, (e) => {
				H(t).format === "omitted" ? e(p) : e(m, -1);
			});
			var h = B(f, 2), g = (e) => {
				var n = gu(), r = R(n);
				P(n), V(() => q(r, `Only part of the recorded output is displayed here. This display limit does not mean the model stopped early.${H(t).format === "json-prefix-text" ? " The JSON prefix is shown as text." : ""}`)), K(e, n);
			};
			J(h, (e) => {
				H(t).truncated && e(g);
			}), P(i), P(r), V((e) => {
				Z(r, "id", n + "-panel"), Z(r, "aria-labelledby", e), Z(i, "data-artifact-kind", H(t).kind), q(l, H(t).label), q(d, H(t).kind);
			}, [() => c(H(t).id)]), U("keydown", r, (e) => e.stopPropagation(), !0), U("paste", r, (e) => e.stopPropagation(), !0), K(e, r);
		}, ie = (e) => {
			var n = vu(), r = R(n, !0);
			P(n), V(() => q(r, t.view.emptyMessage ?? (t.view.status === "not-run" ? "This output has not run yet. Use Run to here, or enable Lattice and send a message in SillyTavern." : "No output was kept for this step. Run it again if you need to inspect its result."))), K(e, n);
		};
		J(ne, (e) => {
			H(s) ? e(re) : H(i).length || e(ie, 1);
		});
		var ae = B(ne, 2), oe = (e) => {
			var n = bu(), r = R(n), i = R(r);
			P(r), Y(B(r, 2), 17, () => t.view.settlement.receipts, (e) => e.intentId + ":" + e.targetId, (e, t) => {
				var n = yu(), r = z(n), i = R(r);
				P(r);
				var a = B(r, 2), o = (e) => {
					{
						let n = /* @__PURE__ */ F(() => ({
							operation: "save",
							nodeTitle: H(t).targetId
						}));
						go(e, {
							get issue() {
								return H(t).error;
							},
							get context() {
								return H(n);
							}
						});
					}
				};
				J(a, (e) => {
					H(t).error && e(o);
				}), V(() => q(i, `${H(t).targetId ?? ""} · ${(H(t).status === "confirmed" || H(t).status === "persisted" ? "Saved" : H(t).status === "failed" ? "Save failed" : H(t).status === "unknown" ? "Save outcome unknown" : H(t).status === "save-unverified" || H(t).status === "unverified" ? "Save not verified" : H(t).status === "unchanged" ? "Already current" : H(t).status) ?? ""}`)), K(e, n);
			}), P(n), V(() => q(i, `Accepted consequences · ${t.view.settlement.status === "settled" ? "Saved" : t.view.settlement.status === "partial" ? "Some targets failed" : "Save confirmation needed"}`)), K(e, n);
		};
		J(ae, (e) => {
			t.view.settlement && e(oe);
		});
		var se = B(ae, 2), ce = (e) => {
			var n = xu(), r = R(n, !0);
			P(n), V(() => q(r, t.view.statusDetail)), K(e, n);
		};
		J(se, (e) => {
			t.view.statusDetail && e(ce);
		});
		var le = B(se, 2), ue = (e) => {
			var n = xu(), r = R(n, !0);
			P(n), V(() => q(r, t.view.historyNotice)), K(e, n);
		};
		J(le, (e) => {
			t.view.historyNotice && e(ue);
		});
		var de = B(le, 2);
		Y(de, 17, () => t.view.sections.filter((e) => e.id !== H(s)?.id && (e.format === "omitted" || e.truncated)), (e) => e.id, (e, t) => {
			var n = Lr(), r = z(n), i = (e) => {
				var n = Su(), r = R(n), i = R(r, !0);
				P(r), go(B(r), { get issue() {
					return H(t).text;
				} }), P(n), V(() => q(i, H(t).label)), K(e, n);
			}, a = (e) => {
				var n = xu(), r = R(n);
				P(n), V(() => q(r, `${H(t).label ?? ""}: Only part of the recorded output is displayed here; this is a display limit.${H(t).format === "json-prefix-text" ? " The JSON prefix is shown as text." : ""}`)), K(e, n);
			};
			J(r, (e) => {
				H(t).format === "omitted" ? e(i) : e(a, -1);
			}), K(e, n);
		});
		var fe = B(de, 2);
		Y(fe, 19, () => H(i), (e) => e.id, (e, t, i) => {
			var a = Cu();
			go(R(a), {
				get diagnostic() {
					return H(t);
				},
				get reveal() {
					return r().reveal;
				}
			}), P(a), V(() => Z(a, "id", n + "-diagnostic-" + H(i))), K(e, a);
		});
		var pe = B(fe, 2), me = (e) => {
			var n = gu(), r = R(n, !0);
			P(n), V(() => q(r, t.view.review.persistOnly ? "Retry keeps the accepted reply and retries only authorized targets whose saves failed. It makes no model request. Unknown or unverified saves cannot be retried here." : "Apply checks that the source, connection and reviewed reply are still current. The displayed preview may show only part of the recorded output.")), K(e, n);
		};
		J(pe, (e) => {
			t.view.review && e(me);
		}), P(te);
		var he = B(te, 2), ge = R(he), _e = R(ge, !0);
		P(ge);
		var ve = B(ge, 2), ye = R(ve, !0);
		P(ve);
		var be = B(ve, 2), xe = (e) => {
			var i = wu(), a = z(i), o = R(a);
			P(a);
			var s = B(a), c = (e) => {
				var t = xu(), r = R(t, !0);
				P(t), V(() => {
					Z(t, "id", n + "-run-reason"), q(r, H(v));
				}), K(e, t);
			};
			J(s, (e) => {
				H(v) && H(b) < 0 && e(c);
			}), V(() => {
				Z(a, "aria-describedby", H(S)), a.disabled = !H(m), q(o, `Run to here · maximum ${t.view.runHere.callBound ?? ""} ${t.view.runHere.callBound === 1 ? "request" : "requests"}`);
			}), W("click", a, () => {
				t.view && H(u) && H(m) && r().runHere?.(t.view.sourceKey, p(H(u).target));
			}), K(e, i);
		};
		J(be, (e) => {
			t.view.runHere && e(xe);
		});
		var Se = B(be, 2), Ce = (e) => {
			var i = Tu(), a = z(i), o = R(a, !0);
			P(a);
			var s = B(a), c = (e) => {
				var t = xu(), r = R(t, !0);
				P(t), V(() => {
					Z(t, "id", n + "-apply-reason"), q(r, H(y));
				}), K(e, t);
			};
			J(s, (e) => {
				H(y) && H(x) < 0 && e(c);
			});
			var l = B(s), u = R(l, !0);
			P(l), V(() => {
				Z(a, "aria-describedby", H(C)), a.disabled = !H(g), q(o, t.view.review.persistOnly ? "Retry failed saves" : "Apply reviewed reply"), l.disabled = !H(_), q(u, t.view.review.persistOnly ? "Close save review" : "Reject reply");
			}), W("click", a, () => {
				t.view?.review && H(g) && r().apply?.(w(t.view.review.selector));
			}), W("click", l, () => {
				t.view?.review && H(_) && r().reject?.(w(t.view.review.selector));
			}), K(e, i);
		};
		J(Se, (e) => {
			t.view.review && e(Ce);
		}), P(he), V((e) => {
			q(E, H(u)?.label ?? t.view.title), Z(O, "title", t.view.pinned ? "Unpin and follow selection" : "Keep this output visible"), Z(O, "aria-pressed", t.view.pinned), O.disabled = t.view.pinned ? !r().follow : !H(u) || !r().pin, q(k, t.view.pinned ? "Pinned output" : "Pin output"), Z(ge, "data-status", t.view.status), q(_e, e), q(ye, t.view.targeted ? "Targeted node" : t.view.pinned ? "Pinned preview" : t.view.followSelection ? "Following selection" : "Selection not followed");
		}, [() => d(t.view.status)]), W("click", O, () => {
			t.view?.pinned ? r().follow?.() : t.view && H(u) && r().pin?.(t.view.sourceKey, p(H(u).target));
		}), K(e, f);
	}, O = (e) => {
		K(e, Du());
	};
	J(E, (e) => {
		t.view ? e(D) : e(O, -1);
	}), P(T), K(e, T), We();
}
Er(["click"]);
//#endregion
//#region ui/RunDetails.svelte
var Au = /* @__PURE__ */ G("<p class=\"pc-run-empty svelte-f9s2fm\">No execution plan has been recorded.</p>"), ju = /* @__PURE__ */ G("<span aria-hidden=\"true\" class=\"svelte-f9s2fm\">▱</span>"), Mu = /* @__PURE__ */ G("<small class=\"svelte-f9s2fm\"> </small>"), Nu = /* @__PURE__ */ G("<div class=\"pc-run-error svelte-f9s2fm\"><!></div>"), Pu = /* @__PURE__ */ G("<details class=\"svelte-f9s2fm\"><summary class=\"svelte-f9s2fm\">Reported usage</summary><div class=\"pc-run-usage svelte-f9s2fm\"><small class=\"svelte-f9s2fm\"> </small><small class=\"svelte-f9s2fm\"> </small><small class=\"svelte-f9s2fm\"> </small><small class=\"svelte-f9s2fm\"> </small></div></details>"), Fu = /* @__PURE__ */ G("<li class=\"svelte-f9s2fm\"><div class=\"pc-run-row-heading svelte-f9s2fm\"><button type=\"button\" class=\"svelte-f9s2fm\"><!> </button><span class=\"pc-run-status svelte-f9s2fm\"> </span></div> <!> <div class=\"pc-run-row-meta svelte-f9s2fm\"><small class=\"svelte-f9s2fm\"> </small><small class=\"svelte-f9s2fm\"> </small></div> <!> <!></li>"), Iu = /* @__PURE__ */ G("<header class=\"svelte-f9s2fm\"><h3 class=\"svelte-f9s2fm\">Run details</h3><span class=\"pc-run-status svelte-f9s2fm\"> </span></header> <div class=\"pc-run-summary svelte-f9s2fm\"><p class=\"svelte-f9s2fm\"> </p><p class=\"svelte-f9s2fm\"> </p><p class=\"svelte-f9s2fm\"> </p></div> <!> <!> <ol class=\"pc-run-rows svelte-f9s2fm\"></ol>", 1), Lu = /* @__PURE__ */ G("<p class=\"pc-run-empty svelte-f9s2fm\">Enable Lattice and Send with the open workflow, or use Run to here to inspect its processing stages.</p>"), Ru = /* @__PURE__ */ G("<section class=\"pc-run-details svelte-f9s2fm\" aria-label=\"Run details\"><!></section>");
function zu(e, t) {
	Ue(t, !0);
	let n = Pi(t, "actions", 19, () => ({})), r = (e) => e === "not-run" ? "Not run" : e === "empty" ? "Ready" : e.charAt(0).toUpperCase() + e.slice(1), i = (e) => e !== null && Number.isFinite(e) && e >= 0 ? (e / 1e3).toFixed(2) + "s" : "Unknown", a = (e) => e != null && Number.isFinite(e) && e >= 0 ? String(e) : "Unknown", o = /* @__PURE__ */ F(() => t.view?.diagnostics ?? lo(t.view?.issue ? [t.view.issue] : []));
	var s = Ru(), c = R(s), l = (e) => {
		var s = Iu(), c = z(s), l = B(R(c)), u = R(l, !0);
		P(l), P(c);
		var d = B(c, 2), f = R(d), p = R(f);
		P(f);
		var m = B(f), h = R(m);
		P(m);
		var g = B(m), _ = R(g);
		P(g), P(d);
		var v = B(d, 2);
		Y(v, 17, () => H(o), (e) => e.id, (e, r) => {
			{
				let i = /* @__PURE__ */ F(() => n().jump ? (e) => {
					t.view && n().jump?.(t.view.runId, e);
				} : void 0);
				go(e, {
					get diagnostic() {
						return H(r);
					},
					get reveal() {
						return H(i);
					}
				});
			}
		});
		var y = B(v, 2), b = (e) => {
			K(e, Au());
		};
		J(y, (e) => {
			!t.view.rows.length && !H(o).length && e(b);
		});
		var x = B(y, 2);
		Y(x, 21, () => t.view.rows, (e) => e.key, (e, s) => {
			var c = Fu();
			let l;
			var u = R(c), d = R(u), f = R(d), p = (e) => {
				K(e, ju());
			};
			J(f, (e) => {
				H(s).kind === "instance" && e(p);
			});
			var m = B(f, 1, !0);
			P(d);
			var h = B(d), g = R(h, !0);
			P(h), P(u);
			var _ = B(u, 2), v = (e) => {
				var t = Mu(), n = R(t, !0);
				P(t), V((e) => q(n, e), [() => r(H(s).subphase)]), K(e, t);
			};
			J(_, (e) => {
				H(s).subphase && e(v);
			});
			var y = B(_, 2), b = R(y), x = R(b);
			P(b);
			var S = B(b), C = R(S);
			P(S), P(y);
			var w = B(y, 2);
			Y(w, 17, () => H(s).diagnostics ?? lo(H(s).issue ? [H(s).issue] : [], { nodeTitle: H(s).title }), (e) => e.id, (e, t) => {
				var n = Lr(), r = z(n), i = (e) => {
					var n = Nu();
					go(R(n), { get diagnostic() {
						return H(t);
					} }), P(n), K(e, n);
				}, a = /* @__PURE__ */ F(() => !H(o).some((e) => e.id === H(t).id));
				J(r, (e) => {
					H(a) && e(i);
				}), K(e, n);
			});
			var T = B(w, 2), E = (e) => {
				var t = Pu(), n = B(R(t)), r = R(n), i = R(r);
				P(r);
				var o = B(r), c = R(o);
				P(o);
				var l = B(o), u = R(l);
				P(l);
				var d = B(l), f = R(d);
				P(d), P(n), P(t), V((e, t, n) => {
					q(i, `Input tokens: ${e ?? ""}`), q(c, `Output tokens: ${t ?? ""}`), q(u, `Total tokens: ${n ?? ""}`), q(f, `Cost: ${H(s).usage?.cost ?? "Unknown" ?? ""}`);
				}, [
					() => a(H(s).usage?.inputTokens),
					() => a(H(s).usage?.outputTokens),
					() => a(H(s).usage?.totalTokens)
				]), K(e, t);
			};
			J(T, (e) => {
				H(s).kind === "primitive" && e(E);
			}), P(c), V((e, t, r) => {
				Z(c, "data-run-row", H(s).key), Z(c, "data-depth", H(s).depth), Z(c, "data-status", H(s).status), l = hi(c, "", l, e), Z(d, "aria-label", "Open " + H(s).title + " in graph"), d.disabled = !n().jump, q(m, H(s).title), Z(h, "data-status", H(s).status), q(g, t), q(x, `Duration: ${r ?? ""}`), q(C, `${H(s).attempts ?? ""} of ${H(s).callBound ?? ""} requests`);
			}, [
				() => ({ "margin-left": `${Math.max(0, Math.min(8, H(s).depth)) * 12}px` }),
				() => r(H(s).status),
				() => i(H(s).durationMs)
			]), W("click", d, () => {
				t.view && n().jump?.(t.view.runId, {
					...H(s).address,
					instancePath: [...H(s).address.instancePath]
				});
			}), K(e, c);
		}), P(x), V((e, n) => {
			Z(l, "data-status", t.view.status), q(u, e), q(p, `${t.view.completedCount ?? ""} of ${t.view.executableCount ?? ""} stages complete`), q(h, `${t.view.actualCalls ?? ""} of ${t.view.callBound ?? ""} requests`), q(_, `Elapsed: ${n ?? ""}`);
		}, [() => r(t.view.status), () => i(t.view.elapsedMs)]), K(e, s);
	}, u = (e) => {
		K(e, Lu());
	};
	J(c, (e) => {
		t.view ? e(l) : e(u, -1);
	}), P(s), K(e, s), We();
}
Er(["click"]);
//#endregion
//#region ui/RunMeter.svelte
var Bu = /* @__PURE__ */ G("<span class=\"pc-run-meter-elapsed svelte-1tkcp3\" data-run-elapsed=\"\"> </span>"), Vu = /* @__PURE__ */ G("<span class=\"pc-run-pixel svelte-1tkcp3\" data-run-pixel=\"\"></span>"), Hu = /* @__PURE__ */ G("<button class=\"pc-run-meter svelte-1tkcp3\"><span class=\"pc-run-meter-label svelte-1tkcp3\"> </span> <!> <span class=\"pc-run-meter-pixels svelte-1tkcp3\" aria-hidden=\"true\"></span></button>");
function Uu(e, t) {
	Ue(t, !0);
	let n = (e) => e === "empty" ? "Ready" : e === "not-run" ? "Not run" : e.charAt(0).toUpperCase() + e.slice(1), r = [
		"cancelling",
		"running",
		"failed",
		"blocked",
		"cancelled",
		"invalid",
		"stale",
		"queued",
		"waiting",
		"not-run"
	], i = /* @__PURE__ */ F(() => {
		if (!t.view) return [];
		let e = t.view.rows.slice(0, t.view.rows.length > 36 ? 35 : 36).map((e) => ({
			key: "row:" + e.id,
			status: e.status,
			title: e.title + " · " + n(e.status)
		}));
		if (t.view.rows.length > 36) {
			let i = t.view.rows.slice(35), a = r.find((e) => i.some((t) => t.status === e)) ?? (i.every((e) => e.status === "completed") ? "completed" : "not-run");
			e.push({
				key: "aggregate",
				status: a,
				title: i.length + " remaining rows · " + n(a) + ". Open run details to inspect every stage."
			});
		}
		return e;
	}), a = /* @__PURE__ */ F(() => t.view ? "Open run details. " + n(t.view.status) + ". " + t.view.completedCount + " of " + t.view.executableCount + " stages complete. " + t.view.actualCalls + " of " + t.view.callBound + " requests." : "Open run details");
	var o = Lr(), s = z(o), c = (e) => {
		var r = Hu(), o = R(r), s = R(o, !0);
		P(o);
		var c = B(o, 2), l = (e) => {
			var n = Bu(), r = R(n);
			P(n), V((e) => q(r, `${e ?? ""}s`), [() => (t.view.elapsedMs / 1e3).toFixed(1)]), K(e, n);
		}, u = /* @__PURE__ */ F(() => t.view.elapsedMs !== null && Number.isFinite(t.view.elapsedMs) && t.view.elapsedMs >= 0);
		J(c, (e) => {
			H(u) && e(l);
		});
		var d = B(c, 2);
		Y(d, 21, () => H(i), (e) => e.key, (e, t) => {
			var n = Vu();
			V(() => {
				Z(n, "data-status", H(t).status), Z(n, "title", H(t).title);
			}), K(e, n);
		}), P(d), P(r), V((e) => {
			Z(r, "aria-label", H(a)), Z(r, "title", H(a)), r.disabled = !t.open, q(s, e);
		}, [() => n(t.view.status)]), W("click", r, () => t.open?.()), K(e, r);
	};
	J(s, (e) => {
		t.view && e(c);
	}), K(e, o), We();
}
Er(["click"]);
//#endregion
//#region ui/PortalManager.svelte
var Wu = /* @__PURE__ */ G("<button type=\"button\" class=\"svelte-mnv790\">Close</button>"), Gu = /* @__PURE__ */ G("<option class=\"svelte-mnv790\"> </option>"), Ku = /* @__PURE__ */ G("<label class=\"svelte-mnv790\">Portal name<input aria-label=\"Portal name\" class=\"svelte-mnv790\"/></label> <p class=\"pc-note svelte-mnv790\"> </p> <div class=\"pc-actions svelte-mnv790\"><button type=\"button\" data-portal-rename=\"\" class=\"svelte-mnv790\">Rename</button></div>", 1), qu = /* @__PURE__ */ G("<p class=\"pc-note svelte-mnv790\">Select a portal or create one from an output.</p>"), Ju = /* @__PURE__ */ G("<button type=\"button\" data-portal-jump-source=\"\" class=\"svelte-mnv790\">Jump to source</button>"), Yu = /* @__PURE__ */ G("<label class=\"pc-check svelte-mnv790\"><input type=\"checkbox\" aria-label=\"Replace existing connection\" class=\"svelte-mnv790\"/>Replace existing connection</label>"), Xu = /* @__PURE__ */ G("<button type=\"button\" data-portal-jump-consumer=\"\" class=\"svelte-mnv790\">Jump</button>"), Zu = /* @__PURE__ */ G("<div class=\"pc-consumer svelte-mnv790\"><span class=\"svelte-mnv790\"> </span><div class=\"pc-actions svelte-mnv790\"><button type=\"button\" data-portal-restore=\"\" class=\"svelte-mnv790\">Restore wire</button> <!></div></div>"), Qu = /* @__PURE__ */ G("<p class=\"pc-note svelte-mnv790\">No consumers.</p>"), $u = /* @__PURE__ */ G("<label class=\"svelte-mnv790\">Existing consumers<select aria-label=\"Existing consumers\" class=\"svelte-mnv790\"><option class=\"svelte-mnv790\">Choose before deleting…</option><option class=\"svelte-mnv790\">Restore visible wires</option><option class=\"svelte-mnv790\">Disconnect consumers</option></select></label>"), ed = /* @__PURE__ */ G("<details open=\"\" class=\"svelte-mnv790\"><summary class=\"svelte-mnv790\">Consumers</summary> <label class=\"svelte-mnv790\">Compatible receiver<select aria-label=\"Compatible receiver\" class=\"svelte-mnv790\"><option class=\"svelte-mnv790\">Select input…</option><!></select></label> <!> <div class=\"pc-actions svelte-mnv790\"><button type=\"button\" data-portal-connect=\"\" class=\"svelte-mnv790\">Connect receiver</button></div> <!> <!> <!> <div class=\"pc-actions svelte-mnv790\"><button type=\"button\" data-portal-delete=\"\" class=\"svelte-mnv790\">Delete portal</button></div></details>"), td = /* @__PURE__ */ G("<details open=\"\" class=\"svelte-mnv790\"><summary class=\"svelte-mnv790\">Convert to portal</summary><p class=\"pc-note svelte-mnv790\"> </p><div class=\"pc-actions svelte-mnv790\"><button type=\"button\" data-portal-convert=\"\" class=\"svelte-mnv790\"> </button></div></details>"), nd = /* @__PURE__ */ G("<div class=\"pc-error svelte-mnv790\"><!></div>"), rd = /* @__PURE__ */ G("<p class=\"pc-note svelte-mnv790\" role=\"status\">Preparing change…</p>"), id = /* @__PURE__ */ G("<p class=\"pc-note svelte-mnv790\"> </p> <label class=\"svelte-mnv790\">Portal<select aria-label=\"Selected portal\" class=\"svelte-mnv790\"><option class=\"svelte-mnv790\">Select portal…</option><!></select></label> <!> <details open=\"\" class=\"svelte-mnv790\"><summary class=\"svelte-mnv790\">Source</summary> <label class=\"svelte-mnv790\">Output<select aria-label=\"Portal source\" class=\"svelte-mnv790\"><option class=\"svelte-mnv790\">Select output…</option><!></select></label> <label class=\"svelte-mnv790\">New portal name<input aria-label=\"New portal name\" class=\"svelte-mnv790\"/></label> <div class=\"pc-actions svelte-mnv790\"><button type=\"button\" data-portal-create=\"\" class=\"svelte-mnv790\">Create portal</button> <button type=\"button\" data-portal-retarget=\"\" class=\"svelte-mnv790\">Retarget</button> <!></div></details> <!> <!> <!> <!> <!>", 1), ad = /* @__PURE__ */ G("<p class=\"pc-note svelte-mnv790\">Open a graph to manage its portals.</p>"), od = /* @__PURE__ */ G("<section class=\"pc-manager svelte-mnv790\" aria-label=\"Manage portals\"><header class=\"svelte-mnv790\"><h2 class=\"svelte-mnv790\">Manage portals</h2><!></header> <!></section>");
function sd(e, t) {
	Ue(t, !0);
	let n = Pi(t, "actions", 19, () => ({})), r = /* @__PURE__ */ I(""), i = /* @__PURE__ */ I(""), a = /* @__PURE__ */ I(""), o = /* @__PURE__ */ I(""), s = /* @__PURE__ */ I(""), c = /* @__PURE__ */ I(!1), l = /* @__PURE__ */ I(""), u = /* @__PURE__ */ I(""), d = "", f = 0, p = !0, m = (e) => JSON.stringify(e.kind === "graph" ? [
		"graph",
		e.workflowId,
		e.instancePath,
		e.definitionRef ? [
			e.definitionRef.id,
			e.definitionRef.version,
			e.definitionRef.semanticHash
		] : null
	] : [
		"library",
		e.definitionRef.id,
		e.definitionRef.version,
		e.definitionRef.semanticHash
	]), h = /* @__PURE__ */ F(() => t.view?.publishers.find((e) => e.id === t.view.selectedPortalId)), g = /* @__PURE__ */ F(() => !!t.view && !!H(h) && t.view.capabilities.rename && (t.view.renameMode === "presentation" ? t.view.canPresent : t.view.scope.kind === "graph" && !t.view.readOnly) && !!n().rename), _ = /* @__PURE__ */ F(() => t.view?.sources.find((e) => e.key === H(a) && e.direction === "output")), v = /* @__PURE__ */ F(() => t.view?.receivers.find((e) => e.key === H(o) && e.direction === "input" && e.kind === H(h)?.kind)), y = /* @__PURE__ */ F(() => !!H(h) && !!H(v) && (!H(v).occupied || H(c)) && C("connect") && !!n().connect), b = /* @__PURE__ */ F(() => !!H(h) && C("remove") && !!n().deletePublisher && (!t.view?.consumers.length || H(s) === "restore" || H(s) === "disconnect"));
	Cn(() => {
		let e = t.view ? JSON.stringify([
			t.view.managerKey,
			t.view.revision,
			m(t.view.scope),
			t.view.selectedPortalId,
			t.view.renameMode
		]) : "";
		d !== e && (d = e, L(r, H(h)?.label ?? "", !0), L(i, ""), L(a, t.view?.sources.find((e) => e.nodeId === H(h)?.source.nodeId && e.portId === H(h)?.source.portId)?.key ?? "", !0), L(o, ""), L(s, ""), L(c, !1), L(l, ""), L(u, ""), f++);
	}), Ii(() => {
		p = !1, f++;
	});
	let x = (e) => ({
		managerKey: e.managerKey,
		revision: e.revision,
		scope: ze(e.scope)
	}), S = (e) => ({
		nodeId: e.nodeId,
		portId: e.portId
	});
	function C(e) {
		return !!t.view && !t.view.readOnly && t.view.scope.kind === "graph" && t.view.capabilities[e];
	}
	function w() {
		L(l, ""), L(u, ""), f++;
	}
	async function T(e, n, r) {
		if (!t.view || !n || H(u)) return;
		let i = x(t.view), a = ++f, o = t.view.selectedPortalId;
		L(u, e, !0), L(l, "");
		try {
			let e = await r(i);
			p && a === f && t.view?.managerKey === i.managerKey && t.view.revision === i.revision && m(t.view.scope) === m(i.scope) && t.view.selectedPortalId === o && (L(u, ""), L(l, e.ok ? "" : e.error.code + ": " + e.error.message, !0));
		} catch (e) {
			p && a === f && t.view?.managerKey === i.managerKey && t.view.revision === i.revision && m(t.view.scope) === m(i.scope) && t.view.selectedPortalId === o && (L(u, ""), L(l, e instanceof Error ? e.message : "The portal change could not be accepted.", !0));
		}
	}
	var E = od(), D = R(E), O = B(R(D)), k = (e) => {
		var t = Wu();
		W("click", t, () => n().close?.()), K(e, t);
	};
	J(O, (e) => {
		n().close && e(k);
	}), P(D);
	var A = B(D, 2), j = (e) => {
		var d = id(), f = z(d), p = R(f);
		P(f);
		var m = B(f, 2), E = B(R(m)), D = R(E);
		D.value = D.__value = "", Y(B(D), 17, () => t.view.publishers, (e) => e.id, (e, t) => {
			var n = Gu(), r = R(n);
			P(n);
			var i = {};
			V(() => {
				q(r, `${H(t).label ?? ""} · ${H(t).kind ?? ""}`), i !== (i = H(t).id) && (n.value = (n.__value = H(t).id) ?? "");
			}), K(e, n);
		}), P(E);
		var O;
		_i(E), P(m);
		var k = B(m, 2), A = (e) => {
			var i = Ku(), a = z(i), o = B(R(a));
			X(o), P(a);
			var s = B(a, 2), c = R(s);
			P(s);
			var l = B(s, 2), d = R(l);
			P(l), V(() => {
				wi(o, H(r)), o.disabled = !H(g), q(c, `${t.view.renameMode === "presentation" ? "Local workspace label · not exported" : "Authored portal label"} · ${H(h).kind ?? ""}`), d.disabled = !H(g) || !!H(u);
			}), W("input", o, (e) => {
				L(r, e.currentTarget.value, !0), w();
			}), W("click", d, () => {
				let e = H(h)?.id, i = t.view?.renameMode, a = H(r);
				e && i && n().rename && T("rename", H(g), (t) => n().rename(t, e, a, i));
			}), K(e, i);
		}, j = (e) => {
			K(e, qu());
		};
		J(k, (e) => {
			H(h) ? e(A) : e(j, -1);
		});
		var M = B(k, 2), ee = B(R(M), 2), te = B(R(ee)), ne = R(te);
		ne.value = ne.__value = "", Y(B(ne), 17, () => t.view.sources, (e) => e.key, (e, t) => {
			var n = Gu(), r = R(n);
			P(n);
			var i = {};
			V(() => {
				q(r, `${H(t).label ?? ""} · ${H(t).kind ?? ""}`), i !== (i = H(t).key) && (n.value = (n.__value = H(t).key) ?? "");
			}), K(e, n);
		}), P(te);
		var re;
		_i(te), P(ee);
		var ie = B(ee, 2), ae = B(R(ie));
		X(ae), P(ie);
		var oe = B(ie, 2), se = R(oe), ce = B(se, 2), le = B(ce, 2), ue = (e) => {
			var r = Ju();
			W("click", r, () => {
				t.view && H(h) && n().jumpSource?.(x(t.view), S(H(h).source));
			}), K(e, r);
		};
		J(le, (e) => {
			H(h) && n().jumpSource && e(ue);
		}), P(oe), P(M);
		var de = B(M, 2), fe = (e) => {
			var r = ed(), i = B(R(r), 2), a = B(R(i)), l = R(a);
			l.value = l.__value = "", Y(B(l), 17, () => t.view.receivers, (e) => e.key, (e, t) => {
				var n = Gu(), r = R(n);
				P(n);
				var i = {};
				V(() => {
					q(r, `${H(t).label ?? ""}${H(t).occupied ? " · Connected" : ""}`), i !== (i = H(t).key) && (n.value = (n.__value = H(t).key) ?? "");
				}), K(e, n);
			}), P(a);
			var d;
			_i(a), P(i);
			var f = B(i, 2), p = (e) => {
				var t = Yu(), n = R(t);
				X(n), Me(), P(t), V((e) => {
					Ti(n, H(c)), n.disabled = e;
				}, [() => !C("connect")]), W("change", n, (e) => {
					L(c, e.currentTarget.checked, !0), w();
				}), K(e, t);
			};
			J(f, (e) => {
				H(v)?.occupied && e(p);
			});
			var m = B(f, 2), g = R(m);
			P(m);
			var _ = B(m, 2);
			Y(_, 17, () => t.view.consumers, (e) => e.edgeId, (e, r) => {
				var i = Zu(), a = R(i), o = R(a, !0);
				P(a);
				var s = B(a), c = R(s), l = B(c, 2), d = (e) => {
					var i = Xu();
					W("click", i, () => {
						let e = t.view?.consumers.find((e) => e.edgeId === H(r).edgeId);
						t.view && e && n().jumpConsumer?.(x(t.view), e.edgeId, S(e.to));
					}), K(e, i);
				};
				J(l, (e) => {
					n().jumpConsumer && e(d);
				}), P(s), P(i), V((e) => {
					q(o, H(r).label), c.disabled = e;
				}, [() => !C("restore") || !n().restoreWire || !!H(u)]), W("click", c, () => {
					let e = t.view?.consumers.find((e) => e.edgeId === H(r).edgeId);
					e && n().restoreWire && T("restore", C("restore"), (t) => n().restoreWire(t, e.edgeId));
				}), K(e, i);
			});
			var E = B(_, 2), D = (e) => {
				K(e, Qu());
			};
			J(E, (e) => {
				t.view.consumers.length || e(D);
			});
			var O = B(E, 2), k = (e) => {
				var t = $u(), n = B(R(t)), r = R(n);
				r.value = r.__value = "";
				var i = B(r);
				i.value = i.__value = "restore";
				var a = B(i);
				a.value = a.__value = "disconnect", P(n);
				var o;
				_i(n), P(t), V((e) => {
					n.disabled = e, o !== (o = H(s)) && (n.value = (n.__value = H(s)) ?? "", gi(n, H(s)));
				}, [() => !C("remove")]), W("change", n, (e) => {
					L(s, e.currentTarget.value, !0), w();
				}), K(e, t);
			};
			J(O, (e) => {
				t.view.consumers.length && e(k);
			});
			var A = B(O, 2), j = R(A);
			P(A), P(r), V((e) => {
				a.disabled = e, d !== (d = H(o)) && (a.value = (a.__value = H(o)) ?? "", gi(a, H(o))), g.disabled = !H(y) || !!H(u), j.disabled = !H(b) || !!H(u);
			}, [() => !C("connect") || !n().connect]), W("change", a, (e) => {
				L(o, e.currentTarget.value, !0), L(c, !1), w();
			}), W("click", g, () => {
				let e = H(v), t = H(h)?.id, r = H(c);
				e && t && n().connect && T("connect", H(y), (i) => n().connect(i, t, S(e), r));
			}), W("click", j, () => {
				let e = H(h)?.id, r = t.view?.consumers.length ? H(s) : "restore";
				e && (r === "restore" || r === "disconnect") && n().deletePublisher && T("remove", H(b), (t) => n().deletePublisher(t, e, r));
			}), K(e, r);
		};
		J(de, (e) => {
			H(h) && e(fe);
		});
		var pe = B(de, 2), me = (e) => {
			var r = td(), i = B(R(r)), a = R(i, !0);
			P(i);
			var o = B(i), s = R(o), c = R(s);
			P(s), P(o), P(r), V((e) => {
				q(a, t.view.conversion.label), s.disabled = e, q(c, `Convert ${t.view.conversion.kind === "wire" ? "wire" : "output"}`);
			}, [() => !C("convert") || !!H(u) || (t.view.conversion.kind === "wire" ? !n().convertWire : !n().convertOutput)]), W("click", s, () => {
				let e = t.view?.conversion;
				e?.kind === "wire" && n().convertWire ? T("convert", C("convert"), (t) => n().convertWire(t, e.edgeId)) : e?.kind === "output" && n().convertOutput && T("convert", C("convert"), (t) => n().convertOutput(t, S(e.endpoint)));
			}), K(e, r);
		};
		J(pe, (e) => {
			t.view.conversion && e(me);
		});
		var he = B(pe, 2), ge = (e) => {
			var n = nd();
			go(R(n), { get issue() {
				return t.view.issue;
			} }), P(n), K(e, n);
		};
		J(he, (e) => {
			t.view.issue && e(ge);
		});
		var _e = B(he, 2), ve = (e) => {
			var t = nd();
			go(R(t), { get issue() {
				return H(l);
			} }), P(t), K(e, t);
		};
		J(_e, (e) => {
			H(l) && e(ve);
		});
		var ye = B(_e, 2), be = (e) => {
			K(e, rd());
		};
		J(ye, (e) => {
			H(u) && e(be);
		}), V((e, r, o, s) => {
			q(p, `${t.view.scopeLabel ?? ""}${t.view.readOnly ? " · Read-only graph" : ""}`), E.disabled = !n().selectPortal, O !== (O = t.view.selectedPortalId ?? "") && (E.value = (E.__value = t.view.selectedPortalId ?? "") ?? "", gi(E, t.view.selectedPortalId ?? "")), te.disabled = e, re !== (re = H(a)) && (te.value = (te.__value = H(a)) ?? "", gi(te, H(a))), wi(ae, H(i)), ae.disabled = r, se.disabled = o, ce.disabled = s;
		}, [
			() => !C("create") && !C("retarget"),
			() => !C("create") || !n().create,
			() => !C("create") || !n().create || !H(_) || !H(i).trim() || !!H(u),
			() => !C("retarget") || !n().retarget || !H(_) || !H(h) || !!H(u)
		]), W("change", E, (e) => {
			let r = e.currentTarget.value;
			e.currentTarget.selectedIndex >= 0 && t.view && n().selectPortal && (!r || t.view.publishers.some((e) => e.id === r)) && n().selectPortal(x(t.view), r || null);
		}), W("change", te, (e) => {
			L(a, e.currentTarget.value, !0), w();
		}), W("input", ae, (e) => {
			L(i, e.currentTarget.value, !0), w();
		}), W("click", se, () => {
			let e = H(_), t = H(i);
			e && t.trim() && n().create && T("create", C("create"), (r) => n().create(r, t, S(e)));
		}), W("click", ce, () => {
			let e = H(_), t = H(h)?.id;
			e && t && n().retarget && T("retarget", C("retarget"), (r) => n().retarget(r, t, S(e)));
		}), K(e, d);
	}, M = (e) => {
		K(e, ad());
	};
	J(A, (e) => {
		t.view ? e(j) : e(M, -1);
	}), P(E), K(e, E), We();
}
Er([
	"click",
	"change",
	"input"
]);
//#endregion
//#region ui/AddSystem.svelte
var cd = /* @__PURE__ */ G("<p>No saved reusable subgraphs are available. Save a subgraph to the shelf first.</p>"), ld = /* @__PURE__ */ G("<option> </option>"), ud = /* @__PURE__ */ G("<label class=\"svelte-j5xg6r\"> <select class=\"svelte-j5xg6r\"><option> </option><!></select></label>"), dd = /* @__PURE__ */ G("<label class=\"svelte-j5xg6r\"> <input placeholder=\"Use saved value\" class=\"svelte-j5xg6r\"/></label>"), fd = /* @__PURE__ */ G("<option>Create Compose Guidance → Generate Reply</option>"), pd = /* @__PURE__ */ G("<p>Generate Reply Guidance is occupied. Connect a Main Compose Guidance merge explicitly first.</p>"), md = /* @__PURE__ */ G("<label class=\"svelte-j5xg6r\">Main merge destination<select aria-label=\"Guidance merge destination\" class=\"svelte-j5xg6r\"><option>Choose merge</option><!><!></select></label><!>", 1), hd = /* @__PURE__ */ G("<fieldset class=\"svelte-j5xg6r\"><legend>Optional reply guidance</legend><label class=\"svelte-j5xg6r\">Guidance output<select aria-label=\"System Guidance output\" class=\"svelte-j5xg6r\"><option>Unused</option><!></select></label> <!></fieldset>"), gd = /* @__PURE__ */ G("<label class=\"svelte-j5xg6r\"> <select class=\"svelte-j5xg6r\"><option>Unused</option><!></select></label>"), _d = /* @__PURE__ */ G("<p>This system participates through its staged state terminals.</p>"), vd = /* @__PURE__ */ G("<!> <!> <!> <!> <!>", 1), yd = /* @__PURE__ */ G("<li> </li>"), bd = /* @__PURE__ */ G("<ul></ul>"), xd = /* @__PURE__ */ G("<p>State-only system; no output bindings.</p>"), Sd = /* @__PURE__ */ G("<div class=\"pc-system-preview svelte-j5xg6r\"><h3 class=\"svelte-j5xg6r\">Connection preview</h3><!><p> </p></div>"), Cd = /* @__PURE__ */ G("<label class=\"svelte-j5xg6r\">Saved system<select aria-label=\"Saved system\" class=\"svelte-j5xg6r\"></select></label> <!> <button type=\"button\" class=\"svelte-j5xg6r\">Preview connections</button> <!>", 1), wd = /* @__PURE__ */ G("<p role=\"alert\" class=\"svelte-j5xg6r\"> </p>"), Td = /* @__PURE__ */ G("<div class=\"pc-system-overlay svelte-j5xg6r\"><div class=\"pc-system-dialog svelte-j5xg6r\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Add system\" tabindex=\"-1\"><header class=\"svelte-j5xg6r\"><h2 class=\"svelte-j5xg6r\">Add system</h2><button type=\"button\" aria-label=\"Close Add system\" class=\"svelte-j5xg6r\">×</button></header> <p>Add an editable system to Main. Connections decide what runs and what reaches the reply.</p> <!> <!> <footer class=\"svelte-j5xg6r\"><button type=\"button\" class=\"svelte-j5xg6r\">Cancel</button><button type=\"button\" class=\"svelte-j5xg6r\">Add system</button></footer></div></div>");
function Ed(e, t) {
	Ue(t, !0);
	let n;
	Fi(() => {
		let e = document.activeElement;
		return (n.querySelector("select") ?? n.querySelector("button"))?.focus({ preventScroll: !0 }), () => e?.focus({ preventScroll: !0 });
	});
	let r = /* @__PURE__ */ I(tn(_r(() => t.view.choices[0]?.key ?? ""))), i = /* @__PURE__ */ I(tn({})), a = /* @__PURE__ */ I(tn({})), o = /* @__PURE__ */ I(tn({})), s = /* @__PURE__ */ I(""), c = /* @__PURE__ */ I(""), l = /* @__PURE__ */ I(""), u = /* @__PURE__ */ I(null), d = /* @__PURE__ */ F(() => t.view.choices.find((e) => e.key === H(r)));
	function f() {
		L(u, null), L(l, "");
	}
	function p(e) {
		L(r, e, !0), L(i, {}, !0), L(a, {}, !0), L(o, {}, !0), L(s, ""), L(c, ""), f();
	}
	function m() {
		let e = {};
		for (let [t, n] of Object.entries(H(i))) n && (e[t] = JSON.parse(n));
		let t = Object.entries(H(a)).filter(([, e]) => e).map(([e, t]) => ({
			outputPortId: e,
			destination: JSON.parse(t)
		})), n = {};
		for (let [e, t] of Object.entries(H(o))) t.trim() && (n[e] = JSON.parse(t));
		return {
			choiceKey: H(r),
			inputs: e,
			outputs: t,
			parameterOverrides: n,
			...H(s) && H(c) ? { guidance: {
				outputPortId: H(s),
				destination: H(c) === "new" ? { kind: "new-compose" } : {
					kind: "existing-compose",
					nodeId: H(c)
				}
			} } : {}
		};
	}
	function h() {
		try {
			if (H(s) && !H(c)) {
				L(l, "Choose a Guidance merge destination."), L(u, null);
				return;
			}
			let e = t.actions.preview(t.view.key, m());
			if (!e.ok) {
				L(l, e.error.message, !0), L(u, null);
				return;
			}
			L(l, ""), L(u, [...e.data.connections, ...e.data.changes.filter((e) => e.kind === "template").map((e) => e.kind === "template" ? "Template: " + e.before + " → " + e.after : "")], !0);
		} catch {
			L(l, "Enter exposed settings as JSON values."), L(u, null);
		}
	}
	function g(e) {
		if (e.stopPropagation(), e.key === "Escape" && (e.preventDefault(), t.actions.close()), e.key === "Tab") {
			let t = [...n.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled)")], r = t[0], i = t.at(-1);
			e.shiftKey && document.activeElement === r && (e.preventDefault(), i?.focus()), !e.shiftKey && document.activeElement === i && (e.preventDefault(), r?.focus());
		}
	}
	var _ = Td(), v = R(_), y = R(v), b = B(R(y));
	P(y);
	var x = B(y, 4), S = (e) => {
		K(e, cd());
	}, C = (e) => {
		var n = Cd(), l = z(n), m = B(R(l));
		Y(m, 21, () => t.view.choices, qr, (e, n) => {
			var r = ld(), i = R(r);
			P(r);
			var a = {};
			V((e) => {
				q(i, `${H(n).name ?? ""} · revision ${H(n).definition.version ?? ""}${e ?? ""}`), a !== (a = H(n).key) && (r.value = (r.__value = H(n).key) ?? "");
			}, [() => t.view.choices.filter((e) => e.name === H(n).name && e.definition.version === H(n).definition.version).length > 1 ? " · " + H(n).definition.id : ""]), K(e, r);
		}), P(m);
		var g;
		_i(m), P(l);
		var _ = B(l, 2), v = (e) => {
			var n = vd(), r = z(n);
			Y(r, 17, () => H(d).inputs, qr, (e, n) => {
				var r = ud(), a = R(r), o = B(a), s = R(o), c = R(s, !0);
				P(s), s.value = s.__value = "", Y(B(s), 17, () => t.view.pins.filter((e) => e.direction === "output" && e.kind === H(n).kind), qr, (e, t) => {
					var n = ld(), r = R(n, !0);
					P(n);
					var i = {};
					V((e) => {
						q(r, H(t).label), i !== (i = e) && (n.value = (n.__value = e) ?? "");
					}, [() => JSON.stringify({
						nodeId: H(t).nodeId,
						portId: H(t).portId
					})]), K(e, n);
				}), P(o);
				var l;
				_i(o), P(r), V(() => {
					q(a, `${H(n).label ?? ""} · ${H(n).kind ?? ""}${H(n).required ? " · required" : ""}`), Z(o, "aria-label", "System input " + H(n).label), q(c, H(n).required ? "Choose source" : "Unused"), l !== (l = H(i)[H(n).id] ?? "") && (o.value = (o.__value = H(i)[H(n).id] ?? "") ?? "", gi(o, H(i)[H(n).id] ?? ""));
				}), W("change", o, (e) => {
					L(i, {
						...H(i),
						[H(n).id]: e.currentTarget.value
					}, !0), f();
				}), K(e, r);
			});
			var l = B(r, 2);
			Y(l, 17, () => H(d).parameters, qr, (e, t) => {
				var n = dd(), r = R(n), i = B(r);
				X(i), P(n), V(() => {
					q(r, `${H(t).label ?? ""} · JSON override`), Z(i, "aria-label", "System setting " + H(t).label), wi(i, H(o)[H(t).id] ?? "");
				}), W("input", i, (e) => {
					L(o, {
						...H(o),
						[H(t).id]: e.currentTarget.value
					}, !0), f();
				}), K(e, n);
			});
			var u = B(l, 2), p = (e) => {
				var n = hd(), r = B(R(n)), i = B(R(r)), a = R(i);
				a.value = a.__value = "", Y(B(a), 17, () => H(d).outputs.filter((e) => e.kind === "guidance"), qr, (e, t) => {
					var n = ld(), r = R(n, !0);
					P(n);
					var i = {};
					V(() => {
						q(r, H(t).label), i !== (i = H(t).id) && (n.value = (n.__value = H(t).id) ?? "");
					}), K(e, n);
				}), P(i);
				var o;
				_i(i), P(r);
				var l = B(r, 2), u = (e) => {
					var n = md(), r = z(n), i = B(R(r)), a = R(i);
					a.value = a.__value = "";
					var o = B(a), s = (e) => {
						var t = fd();
						t.value = t.__value = "new", K(e, t);
					};
					J(o, (e) => {
						t.view.canCreate && e(s);
					}), Y(B(o), 17, () => t.view.destinations, qr, (e, t) => {
						var n = ld(), r = R(n);
						P(n);
						var i = {};
						V(() => {
							q(r, `${H(t).label ?? ""} → Generate Reply`), i !== (i = H(t).nodeId) && (n.value = (n.__value = H(t).nodeId) ?? "");
						}), K(e, n);
					}), P(i);
					var l;
					_i(i), P(r);
					var u = B(r), d = (e) => {
						K(e, pd());
					};
					J(u, (e) => {
						!t.view.canCreate && !t.view.destinations.length && e(d);
					}), V(() => {
						l !== (l = H(c)) && (i.value = (i.__value = H(c)) ?? "", gi(i, H(c)));
					}), W("change", i, (e) => {
						L(c, e.currentTarget.value, !0), f();
					}), K(e, n);
				};
				J(l, (e) => {
					H(s) && e(u);
				}), P(n), V(() => {
					o !== (o = H(s)) && (i.value = (i.__value = H(s)) ?? "", gi(i, H(s)));
				}), W("change", i, (e) => {
					L(s, e.currentTarget.value, !0), f();
				}), K(e, n);
			}, m = /* @__PURE__ */ F(() => H(d).outputs.some((e) => e.kind === "guidance"));
			J(u, (e) => {
				H(m) && e(p);
			});
			var h = B(u, 2);
			Y(h, 17, () => H(d).outputs.filter((e) => e.id !== H(s) || !!H(a)[e.id]), qr, (e, n) => {
				var r = gd(), i = R(r), o = B(i), s = R(o);
				s.value = s.__value = "", Y(B(s), 17, () => t.view.pins.filter((e) => e.direction === "input" && e.kind === H(n).kind && !e.occupied), qr, (e, t) => {
					var n = ld(), r = R(n, !0);
					P(n);
					var i = {};
					V((e) => {
						q(r, H(t).label), i !== (i = e) && (n.value = (n.__value = e) ?? "");
					}, [() => JSON.stringify({
						nodeId: H(t).nodeId,
						portId: H(t).portId
					})]), K(e, n);
				}), P(o);
				var c;
				_i(o), P(r), V(() => {
					q(i, `${H(n).label ?? ""} · explicit ${H(n).kind ?? ""} destination`), Z(o, "aria-label", "System output " + H(n).label), c !== (c = H(a)[H(n).id] ?? "") && (o.value = (o.__value = H(a)[H(n).id] ?? "") ?? "", gi(o, H(a)[H(n).id] ?? ""));
				}), W("change", o, (e) => {
					L(a, {
						...H(a),
						[H(n).id]: e.currentTarget.value
					}, !0), f();
				}), K(e, r);
			});
			var g = B(h, 2), _ = (e) => {
				K(e, _d());
			};
			J(g, (e) => {
				H(d).outputs.length || e(_);
			}), K(e, n);
		};
		J(_, (e) => {
			H(d) && e(v);
		});
		var y = B(_, 2), b = B(y, 2), x = (e) => {
			var t = Sd(), n = B(R(t)), r = (e) => {
				var t = bd();
				Y(t, 21, () => H(u), qr, (e, t) => {
					var n = yd(), r = R(n, !0);
					P(n), V(() => q(r, H(t))), K(e, n);
				}), P(t), K(e, t);
			}, i = (e) => {
				K(e, xd());
			};
			J(n, (e) => {
				H(u).length ? e(r) : e(i, -1);
			});
			var a = B(n), o = R(a);
			P(a), P(t), V(() => q(o, `Adds ${H(d)?.name ?? ""} to Main and opens its tab. Undo removes the whole addition.`)), K(e, t);
		};
		J(b, (e) => {
			H(u) && e(x);
		}), V(() => {
			g !== (g = H(r)) && (m.value = (m.__value = H(r)) ?? "", gi(m, H(r)));
		}), W("change", m, (e) => p(e.currentTarget.value)), W("click", y, h), K(e, n);
	};
	J(x, (e) => {
		t.view.choices.length ? e(C, -1) : e(S);
	});
	var w = B(x, 2), T = (e) => {
		var n = wd(), r = R(n, !0);
		P(n), V(() => q(r, H(l) || t.view.error)), K(e, n);
	};
	J(w, (e) => {
		(H(l) || t.view.error) && e(T);
	});
	var E = B(w, 2), D = R(E), O = B(D);
	P(E), P(v), Ni(v, (e) => n = e, () => n), P(_), V(() => O.disabled = !H(u)), U("keydown", v, g, !0), U("paste", v, (e) => e.stopPropagation()), W("click", b, () => t.actions.close()), W("click", D, () => t.actions.close()), W("click", O, () => t.actions.submit(t.view.key)), K(e, _), We();
}
Er([
	"click",
	"change",
	"input"
]);
//#endregion
//#region ui/SubgraphSave.svelte
var Dd = /* @__PURE__ */ G("<option class=\"svelte-1n658sg\"> </option>"), Od = /* @__PURE__ */ G("<div class=\"pc-save-error svelte-1n658sg\"><!></div>"), kd = /* @__PURE__ */ G("<div class=\"pc-workspace-overlay svelte-1n658sg\"><div class=\"pc-workspace-dialog pc-subgraph-save svelte-1n658sg\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Save subgraph\" tabindex=\"-1\"><header class=\"svelte-1n658sg\"><h2 class=\"svelte-1n658sg\">Save subgraph</h2><button type=\"button\" aria-label=\"Close save subgraph\" class=\"svelte-1n658sg\">×</button></header> <form class=\"svelte-1n658sg\"><label class=\"svelte-1n658sg\">Name<input aria-label=\"Subgraph name\" maxlength=\"80\" class=\"svelte-1n658sg\"/></label> <label class=\"svelte-1n658sg\">Save as<select aria-label=\"Save as\" class=\"svelte-1n658sg\"><option class=\"svelte-1n658sg\">Save new subgraph</option><!></select></label> <p class=\"svelte-1n658sg\">Edits stay local until you save. Existing placed copies stay unchanged.</p> <!> <footer class=\"svelte-1n658sg\"><button type=\"button\" class=\"svelte-1n658sg\">Cancel</button><button type=\"submit\" data-save-subgraph=\"\" class=\"svelte-1n658sg\"> </button></footer></form></div></div>");
function Ad(e, t) {
	Ue(t, !0);
	let n, r = /* @__PURE__ */ I(""), i = /* @__PURE__ */ I(""), a = /* @__PURE__ */ I(!1), o = /* @__PURE__ */ I(""), s = "", c = 0;
	Cn(() => {
		if (t.view.key === s) return;
		s = t.view.key, c++, L(r, t.view.name, !0), L(i, t.view.targetId ?? "", !0), L(a, !1), L(o, "");
		let e = s;
		mr().then(() => {
			if (t.view.key === e) {
				let e = n?.querySelector("input");
				e?.focus({ preventScroll: !0 }), e?.select();
			}
		});
	}), Fi(() => {
		let e = document.activeElement;
		return () => e?.focus({ preventScroll: !0 });
	});
	async function l(e) {
		if (e.preventDefault(), !t.actions || !H(r).trim() || H(a) || H(i) && !t.view.entries.some((e) => e.id === H(i))) return;
		let n = t.view.key, s = ++c;
		L(a, !0), L(o, "");
		try {
			await t.actions.save(n, H(r), H(i) || null);
		} catch {
			t.view.key === n && s === c && L(o, "The subgraph could not be saved. Check the current settings before trying the edit again.");
		} finally {
			t.view.key === n && s === c && L(a, !1);
		}
	}
	function u(e) {
		if (e.stopPropagation(), e.key === "Escape" && (e.preventDefault(), t.actions?.close()), e.key === "Tab") {
			let t = [...n.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled)")], r = t[0], i = t.at(-1);
			e.shiftKey && document.activeElement === r && (e.preventDefault(), i?.focus()), !e.shiftKey && document.activeElement === i && (e.preventDefault(), r?.focus());
		}
	}
	var d = kd(), f = R(d), p = R(f), m = B(R(p));
	P(p);
	var h = B(p, 2), g = R(h), _ = B(R(g));
	X(_), P(g);
	var v = B(g, 2), y = B(R(v)), b = R(y);
	b.value = b.__value = "", Y(B(b), 17, () => t.view.entries, (e) => e.id, (e, t) => {
		var n = Dd(), r = R(n);
		P(n);
		var i = {};
		V(() => {
			q(r, `Update ${H(t).name ?? ""}`), i !== (i = H(t).id) && (n.value = (n.__value = H(t).id) ?? "");
		}), K(e, n);
	}), P(y), P(v);
	var x = B(v, 4), S = (e) => {
		var n = Od(), r = R(n);
		{
			let e = /* @__PURE__ */ F(() => t.view.error || H(o));
			go(r, { get issue() {
				return H(e);
			} });
		}
		P(n), K(e, n);
	};
	J(x, (e) => {
		(t.view.error || H(o)) && e(S);
	});
	var C = B(x, 2), w = R(C), T = B(w), E = R(T, !0);
	P(T), P(C), P(h), P(f), Ni(f, (e) => n = e, () => n), P(d), V((e) => {
		T.disabled = e, q(E, H(a) ? "Saving…" : "Save");
	}, [() => !t.actions || !H(r).trim() || H(a)]), U("keydown", f, u, !0), U("paste", f, (e) => e.stopPropagation()), W("click", m, () => t.actions?.close()), U("submit", h, l), ki(_, () => H(r), (e) => L(r, e)), vi(y, () => H(i), (e) => L(i, e)), W("click", w, () => t.actions?.close()), K(e, d), We();
}
Er(["click"]);
//#endregion
//#region src/workflow/operations/json-data.js?v=0.27.0
function jd(e) {
	if (typeof e != "object" || !e) return JSON.stringify(e);
	if (Array.isArray(e)) {
		let t = "[";
		for (let n = 0; n < e.length; n++) t += `${n ? "," : ""}${jd(e[n])}`;
		return `${t}]`;
	}
	let t = "{", n = Object.keys(e);
	for (let r = 0; r < n.length; r++) {
		let i = n[r];
		t += `${r ? "," : ""}${JSON.stringify(i)}:${jd(e[i])}`;
	}
	return `${t}}`;
}
function Md(e) {
	let t = /* @__PURE__ */ new Set(), n = 0, r = (e, i = 0) => {
		if (i > 32 || ++n > 1e4) throw Error("JSON structure exceeds limits.");
		if (e === null || typeof e == "string" || typeof e == "boolean" || typeof e == "number" && Number.isFinite(e)) return e;
		if (typeof e != "object" || !e) throw Error("Unsupported JSON value.");
		let a = Array.isArray(e), o = Object.getPrototypeOf(e);
		if (a ? o !== Array.prototype : o !== Object.prototype && o !== null) throw Error("JSON objects must be plain.");
		if (t.has(e)) throw Error("JSON values cannot contain cycles.");
		t.add(e);
		let s = a ? [] : {}, c = Reflect.ownKeys(e);
		if (a && c.length !== e.length + 1) throw Error("JSON arrays must be dense.");
		for (let t of c) {
			if (a && t === "length") continue;
			let n = Object.getOwnPropertyDescriptor(e, t);
			if (typeof t != "string" || !n || !Object.hasOwn(n, "value") || !n.enumerable) throw Error("JSON requires enumerable own data properties.");
			if (a && (!/^(0|[1-9]\d*)$/.test(t) || Number(t) >= e.length)) throw Error("JSON arrays cannot contain named properties.");
			Object.defineProperty(s, t, {
				value: r(n.value, i + 1),
				enumerable: !0,
				configurable: !0,
				writable: !0
			});
		}
		return t.delete(e), s;
	};
	try {
		let t = r(e);
		if (new TextEncoder().encode(jd(t)).byteLength > 262144) throw Error("JSON byte limit exceeded.");
		return {
			ok: !0,
			data: { value: t }
		};
	} catch {
		return {
			ok: !1,
			error: {
				code: "INVALID_JSON_VALUE",
				message: "Input must contain only plain JSON data."
			}
		};
	}
}
//#endregion
//#region src/workflow/story-time.js?v=0.27.0
var Nd = (e, t) => ({
	ok: !1,
	error: {
		code: e,
		message: t
	}
}), Pd = (e) => Number.isSafeInteger(e) && e >= 0, Fd = (e, t) => Object.hasOwn(e, t) ? e[t] : void 0, Id = (e) => typeof e == "object" && !!e && !Array.isArray(e), Ld = (e) => typeof e == "string" && e.trim().length > 0 && e.length <= 256, Rd = (e) => Array.isArray(e) && e.every((e) => typeof e == "string" && e.length > 0 && e.length <= 4096);
function zd(e, t) {
	let n = Bd(e);
	if (!n.ok) return n;
	let r = n.data, i = Md(t);
	if (!i.ok || !i.data.value || Array.isArray(i.data.value) || typeof i.data.value != "object") return Nd("INVALID_PROPOSAL", "Use a plain duration or destination proposal.");
	let a = i.data.value, o = Fd(a, "kind");
	if (o !== "duration" && o !== "destination") return Nd("UNRESOLVED_TIME", "An explicit duration or destination is required.");
	if (o === "duration" ? !Pd(Fd(a, "minutes")) || Object.hasOwn(a, "absoluteMinute") : !Pd(Fd(a, "absoluteMinute")) || Object.hasOwn(a, "minutes")) return Nd("INVALID_PROPOSAL", "Use one nonnegative safe-integer minute value.");
	let s = [
		"kind",
		"evidence",
		o === "duration" ? "minutes" : "absoluteMinute"
	];
	if (Object.keys(a).some((e) => !s.includes(e))) return Nd("INVALID_PROPOSAL", "Proposal contains ambiguous or unsupported timing fields.");
	let c = o === "destination" ? a.absoluteMinute : r.absoluteMinute + a.minutes;
	if (!Pd(c) || c < r.absoluteMinute) return Nd("INVALID_DESTINATION", "Destination must be a forward safe-integer minute.");
	let l = Hd(Object.hasOwn(a, "evidence") ? a.evidence : { kind: "explicit" });
	if (!l.ok) return l;
	let u = l.data, d = u.kind, f = structuredClone(r), p = structuredClone(u);
	return o === "duration" && r.timeEvidence?.kind === "estimate" && (p = d === "estimate" ? {
		...p,
		lineage: [.../* @__PURE__ */ new Set([...r.timeEvidence.lineage ?? [r.timeEvidence.origin], ...u.lineage ?? [u.origin]])]
	} : structuredClone(r.timeEvidence), p.lineage?.length > 64) ? Nd("EVIDENCE_LIMIT", "Estimate provenance exceeds 64 sources; hold the entire time projection.") : Vd({
		previousClock: f,
		clock: {
			...structuredClone(r),
			absoluteMinute: c,
			timeEvidence: p
		},
		requestedAbsoluteMinute: c,
		elapsedMinutes: c - r.absoluteMinute,
		evidence: u,
		actualCalls: 0
	});
}
function Bd(e) {
	let t = Md(e);
	if (!t.ok || !t.data.value || typeof t.data.value != "object" || Array.isArray(t.data.value)) return Nd("INVALID_CLOCK", "Clock must contain bounded own plain data.");
	let n = t.data.value;
	if (!Ld(Fd(n, "clockId")) || !Ld(Fd(n, "calendarId")) || !Pd(Fd(n, "absoluteMinute")) || !Pd(Fd(n, "dayLengthMinutes")) || n.dayLengthMinutes === 0) return Nd("INVALID_CLOCK", "Clock requires identities and safe-integer minute/calendar values.");
	if (Object.hasOwn(n, "schemaVersion") && n.schemaVersion !== 1) return Nd("INVALID_CLOCK", "Clock schema version must be 1.");
	if (Object.hasOwn(n, "revision") && (!Pd(n.revision) || n.revision < 1)) return Nd("INVALID_CLOCK", "Clock revision must be a positive safe integer.");
	if (Object.hasOwn(n, "timeEvidence") && !Hd(n.timeEvidence).ok) return Nd("INVALID_CLOCK", "Clock time evidence must retain accepted provenance.");
	if (Object.hasOwn(n, "settledTimeEventIds") && !Rd(n.settledTimeEventIds)) return Nd("INVALID_CLOCK", "Settled occurrence IDs must be a bounded string array.");
	for (let [e, t] of [
		["unit", "minute"],
		["originMinute", 0],
		["originDay", 1]
	]) if (Object.hasOwn(n, e) && n[e] !== t) return Nd("INVALID_CALENDAR", "This calendar uses minute units with minute zero at Day 1.");
	return {
		ok: !0,
		data: n
	};
}
function Vd(e) {
	let t = Md(e);
	return t.ok ? {
		ok: !0,
		data: t.data.value
	} : Nd("OUTPUT_LIMIT", "Projection exceeds the bounded plain-data DTO budget.");
}
function Hd(e) {
	if (!Id(e)) return Nd("INVALID_EVIDENCE", "Evidence must be a plain record.");
	let t = Fd(e, "kind");
	if (![
		"explicit",
		"authored-rule",
		"validated-extraction",
		"estimate",
		"vague"
	].includes(t)) return Nd("INVALID_EVIDENCE", "Use a supported time evidence kind.");
	let n = t === "estimate" ? [
		"kind",
		"origin",
		"acceptancePolicy",
		"lineage"
	] : ["kind", "origin"];
	if (Object.keys(e).some((e) => !n.includes(e))) return Nd("INVALID_EVIDENCE", "Evidence contains unsupported or contradictory fields.");
	let r = typeof Fd(e, "origin") == "string" && e.origin.trim().length > 0;
	if (Object.hasOwn(e, "origin") && !r) return Nd("INVALID_EVIDENCE", "Evidence origin must be nonempty text.");
	if (t === "estimate" && Object.hasOwn(e, "acceptancePolicy") && !["accept", "unresolved"].includes(e.acceptancePolicy)) return Nd("INVALID_EVIDENCE", "Estimate acceptance policy must be accept or unresolved.");
	if (Object.hasOwn(e, "lineage")) {
		let t = e.lineage;
		if (!Array.isArray(t) || t.length === 0 || !t.every((e) => typeof e == "string" && e.trim().length > 0) || new Set(t).size !== t.length || !t.includes(e.origin)) return Nd("INVALID_EVIDENCE", "Estimate lineage must contain distinct nonempty text origins including the current origin.");
		if (t.length > 64) return Nd("EVIDENCE_LIMIT", "Estimate provenance exceeds 64 sources; hold the entire time projection.");
	}
	return t === "vague" || t === "estimate" && (!r || Fd(e, "acceptancePolicy") !== "accept") ? Nd("UNRESOLVED_TIME", "Estimated or vague time needs an explicit accepted authored rule.") : ["authored-rule", "validated-extraction"].includes(t) && !r ? Nd("INVALID_EVIDENCE", "Rule and extraction evidence must identify their origin.") : {
		ok: !0,
		data: e
	};
}
new TextEncoder();
//#endregion
//#region src/ui/story-document-setup.js
var Ud = (e, t) => ({
	ok: !1,
	error: {
		code: e,
		message: t
	}
});
function Wd(e, t, n = 0) {
	let r = {
		schemaVersion: 1,
		clockId: e,
		calendarId: t,
		dayLengthMinutes: 1440,
		absoluteMinute: n,
		revision: 1,
		unit: "minute",
		originMinute: 0,
		originDay: 1,
		timeEvidence: { kind: "explicit" }
	};
	return zd(r, {
		kind: "duration",
		minutes: 0
	}).ok ? {
		ok: !0,
		data: { text: JSON.stringify(r, null, 2) }
	} : Ud("INVALID_CLOCK_TEMPLATE", "Choose explicit clock/calendar IDs and a nonnegative whole story minute.");
}
//#endregion
//#region ui/StoryDocuments.svelte
var Gd = /* @__PURE__ */ G("<div class=\"svelte-1t33cem\"><!></div>"), Kd = /* @__PURE__ */ G("<option class=\"svelte-1t33cem\"> </option>"), qd = /* @__PURE__ */ G("<label class=\"svelte-1t33cem\">Actor ID<input aria-label=\"Actor ID\" maxlength=\"128\" class=\"svelte-1t33cem\"/></label>"), Jd = /* @__PURE__ */ G("<label class=\"svelte-1t33cem\">CSV columns, comma separated<input aria-label=\"CSV columns\" class=\"svelte-1t33cem\"/></label>"), Yd = /* @__PURE__ */ G("<details class=\"svelte-1t33cem\"><summary class=\"svelte-1t33cem\">Story clock template</summary><label class=\"svelte-1t33cem\">Calendar ID<input aria-label=\"Calendar ID\" class=\"svelte-1t33cem\"/></label><label class=\"svelte-1t33cem\">Starting story minute<input aria-label=\"Starting story minute\" type=\"number\" min=\"0\" step=\"1\" class=\"svelte-1t33cem\"/></label><button type=\"button\" class=\"svelte-1t33cem\">Use story clock template</button><p class=\"svelte-1t33cem\">Midnight on the first day is minute 0. The clock advances through graph events, using explicit story time.</p></details>"), Xd = /* @__PURE__ */ G("<p role=\"status\" class=\"svelte-1t33cem\"> </p>"), Zd = /* @__PURE__ */ G("<div class=\"pc-story-documents svelte-1t33cem\"><p class=\"svelte-1t33cem\"> </p> <p class=\"svelte-1t33cem\">Manage the documents used by your workflows here. Updating an authorization or its initial template leaves existing canonical document content intact. Read File and Write File use these target IDs.</p> <!> <label class=\"svelte-1t33cem\">Workflow data document<select aria-label=\"Workflow data document\" class=\"svelte-1t33cem\"><option class=\"svelte-1t33cem\">New document authorization</option><!></select></label> <div class=\"pc-document-actions svelte-1t33cem\"><button type=\"button\" class=\"svelte-1t33cem\">Load initial template</button><button type=\"button\" class=\"svelte-1t33cem\">Remove authorization</button><button type=\"button\" class=\"svelte-1t33cem\">Refresh scope</button></div> <form class=\"svelte-1t33cem\"><label class=\"svelte-1t33cem\">Logical target ID<input aria-label=\"Logical target ID\" maxlength=\"128\" placeholder=\"souls.json\" class=\"svelte-1t33cem\"/></label> <label class=\"svelte-1t33cem\">Document name<input aria-label=\"Document name\" maxlength=\"256\" class=\"svelte-1t33cem\"/></label> <label class=\"svelte-1t33cem\">Format<select aria-label=\"Document format\" class=\"svelte-1t33cem\"><option class=\"svelte-1t33cem\">JSON</option><option class=\"svelte-1t33cem\">JSON Lines</option><option class=\"svelte-1t33cem\">CSV</option><option class=\"svelte-1t33cem\">Plain text</option><option class=\"svelte-1t33cem\">Markdown</option></select></label> <label class=\"svelte-1t33cem\">Visibility<select aria-label=\"Document visibility\" class=\"svelte-1t33cem\"><option class=\"svelte-1t33cem\">Public</option><option class=\"svelte-1t33cem\">Hidden</option><option class=\"svelte-1t33cem\">Actor private</option></select></label> <!> <!> <!> <label class=\"svelte-1t33cem\">Initial template<textarea aria-label=\"Initial template\" rows=\"7\" maxlength=\"100000\" class=\"svelte-1t33cem\"></textarea></label> <p class=\"svelte-1t33cem\">JSON templates preserve your chosen object or list structure. CSV uses the named columns. Existing authorizations require explicit template loading before editing.</p> <!><!> <footer class=\"svelte-1t33cem\"><button type=\"button\" class=\"svelte-1t33cem\">Close</button><button type=\"submit\" class=\"svelte-1t33cem\"> </button></footer></form></div>");
function Qd(e, t) {
	Ue(t, !0);
	let n = /* @__PURE__ */ I(""), r = /* @__PURE__ */ I(""), i = /* @__PURE__ */ I(""), a = /* @__PURE__ */ I("json"), o = /* @__PURE__ */ I(""), s = /* @__PURE__ */ I("public"), c = /* @__PURE__ */ I(""), l = /* @__PURE__ */ I(""), u = /* @__PURE__ */ I(!1), d = /* @__PURE__ */ I(""), f = /* @__PURE__ */ I(""), p = /* @__PURE__ */ I(!1), m = /* @__PURE__ */ I("story-calendar"), h = /* @__PURE__ */ I(0), g = "", _ = 0;
	function v() {
		L(r, ""), L(i, ""), L(a, "json"), L(o, ""), L(s, "public"), L(c, ""), L(l, ""), L(p, !1), L(d, ""), L(f, "");
	}
	Cn(() => {
		t.view.key !== g && (g = t.view.key, _++, L(u, !1), L(n, ""), v());
	});
	function y() {
		_++, L(u, !1), v();
		let e = t.view.documents.find((e) => e.targetId === H(n));
		e && (L(r, e.targetId, !0), L(i, e.name, !0), L(a, e.format, !0), L(s, e.visibility.kind, !0), L(c, e.visibility.kind === "actor-private" ? e.visibility.actorId : "", !0), L(l, e.columns?.join(", ") ?? "", !0));
	}
	function b() {
		let e = Wd(H(r), H(m), H(h));
		e.ok ? (L(o, e.data.text, !0), L(d, "")) : L(d, e.error.code + ": " + e.error.message);
	}
	async function x(e) {
		if (!t.actions || H(u) || !t.view.key) return;
		let m = t.view.key, h = ++_;
		L(u, !0), L(d, ""), L(f, "");
		try {
			let u;
			if (e === "load") u = await t.actions.load(m, H(n));
			else if (e === "remove") u = await t.actions.remove(m, H(n));
			else {
				let e = {
					targetId: H(r),
					name: H(i),
					format: H(a),
					content: H(o),
					visibility: H(s) === "actor-private" ? {
						kind: H(s),
						actorId: H(c)
					} : { kind: H(s) }
				};
				H(a) === "csv" && (e.columns = H(l).split(",").map((e) => e.trim()).filter(Boolean)), u = await t.actions.save(m, e);
			}
			if (m !== t.view.key || h !== _) return;
			if (!u?.ok) {
				L(d, (u?.error ? u.error.code + ": " + u.error.message : void 0) ?? "Workflow Data setup could not be applied.", !0);
				return;
			}
			if (e === "load") {
				let e = u.data?.definition;
				if (!e) {
					L(d, "The initial template could not be loaded.");
					return;
				}
				L(r, e.targetId, !0), L(i, e.name, !0), L(a, e.format, !0), L(o, e.content, !0), L(s, e.visibility.kind, !0), L(c, e.visibility.actorId ?? "", !0), L(l, e.columns?.join(", ") ?? "", !0), L(p, !0);
			} else L(f, u.data?.message ?? "Authorization updated locally.", !0), L(p, !1);
		} catch {
			m === t.view.key && h === _ && L(d, "Workflow Data setup could not be applied.");
		} finally {
			m === t.view.key && h === _ && L(u, !1);
		}
	}
	var S = Zd(), C = R(S), w = R(C);
	P(C);
	var T = B(C, 4), E = (e) => {
		var n = Gd();
		go(R(n), { get issue() {
			return t.view.issue;
		} }), P(n), K(e, n);
	};
	J(T, (e) => {
		t.view.issue && e(E);
	});
	var D = B(T, 2), O = B(R(D)), k = R(O);
	k.value = k.__value = "", Y(B(k), 17, () => t.view.documents, (e) => e.targetId, (e, t) => {
		var n = Kd(), r = R(n);
		P(n);
		var i = {};
		V(() => {
			q(r, `${H(t).name ?? ""} (${H(t).targetId ?? ""}, ${H(t).format ?? ""}, ${H(t).visibility.kind ?? ""})`), i !== (i = H(t).targetId) && (n.value = (n.__value = H(t).targetId) ?? "");
		}), K(e, n);
	}), P(O), P(D);
	var A = B(D, 2), j = R(A), M = B(j), ee = B(M);
	P(A);
	var te = B(A, 2), ne = R(te), re = B(R(ne));
	X(re), P(ne);
	var ie = B(ne, 2), ae = B(R(ie));
	X(ae), P(ie);
	var oe = B(ie, 2), se = B(R(oe)), ce = R(se);
	ce.value = ce.__value = "json";
	var le = B(ce);
	le.value = le.__value = "jsonl";
	var ue = B(le);
	ue.value = ue.__value = "csv";
	var de = B(ue);
	de.value = de.__value = "text";
	var fe = B(de);
	fe.value = fe.__value = "markdown", P(se), P(oe);
	var pe = B(oe, 2), me = B(R(pe)), he = R(me);
	he.value = he.__value = "public";
	var ge = B(he);
	ge.value = ge.__value = "hidden";
	var _e = B(ge);
	_e.value = _e.__value = "actor-private", P(me), P(pe);
	var ve = B(pe, 2), ye = (e) => {
		var t = qd(), n = B(R(t));
		X(n), P(t), V(() => n.disabled = H(u)), ki(n, () => H(c), (e) => L(c, e)), K(e, t);
	};
	J(ve, (e) => {
		H(s) === "actor-private" && e(ye);
	});
	var be = B(ve, 2), xe = (e) => {
		var t = Jd(), n = B(R(t));
		X(n), P(t), V(() => n.disabled = H(u)), ki(n, () => H(l), (e) => L(l, e)), K(e, t);
	};
	J(be, (e) => {
		H(a) === "csv" && e(xe);
	});
	var Se = B(be, 2), Ce = (e) => {
		var t = Yd(), i = B(R(t)), a = B(R(i));
		X(a), P(i);
		var o = B(i), s = B(R(o));
		X(s), P(o);
		var c = B(o);
		Me(), P(t), V((e) => {
			a.disabled = H(u), s.disabled = H(u), c.disabled = e;
		}, [() => !H(r).trim() || H(u) || !!H(n) && !H(p)]), ki(a, () => H(m), (e) => L(m, e)), ki(s, () => H(h), (e) => L(h, e)), W("click", c, b), K(e, t);
	};
	J(Se, (e) => {
		H(a) === "json" && e(Ce);
	});
	var we = B(Se, 2), Te = B(R(we));
	at(Te), P(we);
	var Ee = B(we, 4), De = (e) => {
		var t = Gd();
		go(R(t), { get issue() {
			return H(d);
		} }), P(t), K(e, t);
	};
	J(Ee, (e) => {
		H(d) && e(De);
	});
	var N = B(Ee), Oe = (e) => {
		var n = Xd(), r = R(n, !0);
		P(n), V(() => q(r, H(f) || t.view.notice)), K(e, n);
	};
	J(N, (e) => {
		(H(f) || t.view.notice) && e(Oe);
	});
	var ke = B(N, 2), Ae = R(ke), je = B(Ae), Ne = R(je, !0);
	P(je), P(ke), P(te), P(S), V((e) => {
		q(w, `Active user: ${(t.view.scope.userId || "Unavailable") ?? ""} · Chat: ${(t.view.scope.chatId || "Unavailable") ?? ""}`), O.disabled = H(u), j.disabled = !H(n) || H(u), M.disabled = !H(n) || H(u), ee.disabled = H(u), re.disabled = !!H(n) || H(u), ae.disabled = H(u), se.disabled = !!H(n) || H(u), me.disabled = H(u), Te.disabled = H(u) || !!H(n) && !H(p), Z(Te, "placeholder", H(a) === "json" ? "[]" : ""), je.disabled = e, q(Ne, H(u) ? "Saving…" : "Save authorization");
	}, [() => !t.actions || !t.view.key || !H(r).trim() || !H(i).trim() || H(u) || !!H(n) && !H(p) || H(s) === "actor-private" && !H(c).trim()]), W("change", O, y), vi(O, () => H(n), (e) => L(n, e)), W("click", j, () => x("load")), W("click", M, () => x("remove")), W("click", ee, () => t.actions?.refresh()), U("submit", te, (e) => {
		e.preventDefault(), x("save");
	}), ki(re, () => H(r), (e) => L(r, e)), ki(ae, () => H(i), (e) => L(i, e)), vi(se, () => H(a), (e) => L(a, e)), vi(me, () => H(s), (e) => L(s, e)), ki(Te, () => H(o), (e) => L(o, e)), W("click", Ae, function(...e) {
		t.close?.apply(this, e);
	}), K(e, S), We();
}
Er(["change", "click"]);
//#endregion
//#region ui/RecallOverview.svelte
var $d = /* @__PURE__ */ G("<p aria-label=\"Recall scope\" class=\"svelte-ejm25z\"> </p>"), ef = /* @__PURE__ */ G("<div><!></div>"), tf = /* @__PURE__ */ G("<p class=\"svelte-ejm25z\">Add a Recall Shortcut to the open unified workflow for the active character. Configure its actor, memory set and policy in Details, then enable Lattice.</p>"), nf = /* @__PURE__ */ G("<p class=\"svelte-ejm25z\"> </p>"), rf = /* @__PURE__ */ G("<li><button type=\"button\"> </button></li>"), af = /* @__PURE__ */ G("<fieldset class=\"svelte-ejm25z\"><legend class=\"svelte-ejm25z\"> </legend><p role=\"status\" class=\"svelte-ejm25z\"> </p> <p class=\"svelte-ejm25z\"> </p> <!> <!> <!> <div class=\"pc-recall-overview-actions svelte-ejm25z\"><button type=\"button\" data-recall-queue=\"\">Queue recall</button><button type=\"button\">Cancel recall</button></div> <!><!> <ul aria-label=\"Matching nodes\"></ul> <small class=\"svelte-ejm25z\"> </small></fieldset>"), of = /* @__PURE__ */ G("<p class=\"svelte-ejm25z\">Queue a memory set for the next reply, generated swipe, or both. Matching nodes share one request.</p> <!> <!> <!> <!> <p class=\"svelte-ejm25z\"><button type=\"button\">Refresh recall state</button></p> <small class=\"svelte-ejm25z\">Shortcuts use physical keys and pause while typing. Automatic Recall uses its own conditions. Queue and Cancel do not generate a reply.</small>", 1);
function sf(e, t) {
	let n = Rr();
	Ue(t, !0);
	let r = /* @__PURE__ */ I(""), i = /* @__PURE__ */ I("");
	async function a(e, n, a) {
		if (!H(r)) {
			L(r, e, !0), L(i, "");
			try {
				let e = await t.actions?.change(n, a, "all");
				e?.ok !== !0 && L(i, (e?.error ? e.error.code + ": " + e.error.message : void 0) ?? "Memory recall is unavailable.", !0);
			} catch {
				L(i, "Memory recall could not be updated.");
			} finally {
				L(r, "");
			}
		}
	}
	var o = of(), s = B(z(o), 2), c = (e) => {
		var n = $d(), r = R(n);
		P(n), V(() => q(r, `User ${t.view.scope.userId ?? ""} · Chat ${t.view.scope.chatId ?? ""} · Actor ${t.view.scope.actorId ?? ""}`)), K(e, n);
	};
	J(s, (e) => {
		t.view?.scope && e(c);
	});
	var l = B(s, 2), u = (e) => {
		var n = ef(), r = R(n);
		{
			let e = /* @__PURE__ */ F(() => H(i) || t.view?.issue);
			go(r, { get issue() {
				return H(e);
			} });
		}
		P(n), K(e, n);
	};
	J(l, (e) => {
		(t.view?.issue || H(i)) && e(u);
	});
	var d = B(l, 2), f = (e) => {
		K(e, tf());
	};
	J(d, (e) => {
		t.view?.sets.length || e(f);
	});
	var p = B(d, 2);
	Y(p, 17, () => t.view?.sets ?? [], (e) => e.memorySetId, (e, i) => {
		let o = /* @__PURE__ */ F(() => H(r) ? "Wait for the Recall change to finish." : t.actions ? H(i).queueAllowed ? "" : H(i).reason || "Recall is already queued." : "Recall actions are unavailable in this workspace."), s = /* @__PURE__ */ F(() => H(r) ? "Wait for the Recall change to finish." : t.actions ? H(i).cancelAllowed ? "" : "No recall is queued to cancel." : "Recall actions are unavailable in this workspace.");
		var c = af(), l = R(c), u = R(l, !0);
		P(l);
		var d = B(l), f = R(d, !0);
		P(d);
		var p = B(d, 2), m = R(p);
		P(p);
		var h = B(p, 2), g = (e) => {
			var t = nf(), n = R(t);
			P(t), V(() => q(n, `Remaining: ${H(i).remainingText ?? ""}`)), K(e, t);
		};
		J(h, (e) => {
			H(i).queued && e(g);
		});
		var _ = B(h, 2), v = (e) => {
			var t = nf(), n = R(t);
			P(t), V(() => q(n, `Pending generations: ${H(i).pendingCount ?? ""}`)), K(e, t);
		};
		J(_, (e) => {
			H(i).pendingCount && e(v);
		});
		var y = B(_, 2), b = (e) => {
			var t = nf(), n = R(t, !0);
			P(t), V(() => q(n, H(i).reason)), K(e, t);
		};
		J(y, (e) => {
			H(i).reason && H(i).reason !== H(o) && e(b);
		});
		var x = B(y, 2), S = R(x), C = B(S);
		P(x);
		var w = B(x, 2), T = (e) => {
			var t = nf(), r = R(t, !0);
			P(t), V(() => {
				Z(t, "id", n + "-queue-" + H(i).memorySetId), q(r, H(o));
			}), K(e, t);
		};
		J(w, (e) => {
			H(o) && e(T);
		});
		var E = B(w), D = (e) => {
			var t = nf(), r = R(t, !0);
			P(t), V(() => {
				Z(t, "id", n + "-cancel-" + H(i).memorySetId), q(r, H(s));
			}), K(e, t);
		};
		J(E, (e) => {
			H(s) && e(D);
		});
		var O = B(E, 2);
		Y(O, 21, () => H(i).linkedNodes, (e) => e.nodeId, (e, n) => {
			var r = rf(), i = R(r), a = R(i);
			P(i), P(r), V(() => {
				i.disabled = !t.actions, q(a, `${H(n).title ?? ""} · ${H(n).displayId ?? H(n).nodeId ?? ""}`);
			}), W("click", i, () => t.actions?.reveal(H(n).nodeId)), K(e, r);
		}), P(O);
		var k = B(O, 2), A = R(k);
		P(k), P(c), V((e) => {
			Z(c, "data-recall-set", H(i).memorySetId), q(u, H(i).memorySetId), q(f, H(i).statusText), q(m, `${H(i).targetLabel ?? ""} · ${H(i).useLabel ?? ""} · ${H(i).consumeLabel ?? ""}`), S.disabled = !!H(r) || !t.actions || !H(i).queueAllowed, Z(S, "aria-label", "Queue recall " + H(i).memorySetId), Z(S, "aria-describedby", H(o) ? n + "-queue-" + H(i).memorySetId : void 0), C.disabled = !!H(r) || !t.actions || !H(i).cancelAllowed, Z(C, "aria-label", "Cancel recall " + H(i).memorySetId), Z(C, "aria-describedby", H(s) ? n + "-cancel-" + H(i).memorySetId : void 0), q(A, `${H(i).nodeIds.length ?? ""} linked ${H(i).nodeIds.length === 1 ? "node" : "nodes"}${e ?? ""}`);
		}, [() => H(i).hotkeys.length ? " · " + H(i).hotkeys.map((e) => e.label).join(", ") : ""]), W("click", S, () => a(H(i).memorySetId, H(i).nodeIds, "queue")), W("click", C, () => a(H(i).memorySetId, H(i).nodeIds, "cancel")), K(e, c);
	});
	var m = B(p, 2), h = R(m);
	P(m), Me(2), V(() => h.disabled = !!H(r) || !t.actions), W("click", h, () => t.actions?.refresh()), K(e, o), We();
}
Er(["click"]);
//#endregion
//#region ui/ConfigureNode.svelte
var cf = /* @__PURE__ */ G("<option class=\"svelte-1srbsqt\"> </option>"), lf = /* @__PURE__ */ G("<p class=\"svelte-1srbsqt\">Authorize a document in Workflow › Configure › Workflow Data, then reopen node creation.</p>"), uf = /* @__PURE__ */ G("<label class=\"svelte-1srbsqt\">Workflow data document<select aria-label=\"Workflow data document\" class=\"svelte-1srbsqt\"><option class=\"svelte-1srbsqt\">Choose an authorized target</option><!></select></label><!>", 1), df = /* @__PURE__ */ G("<label class=\"svelte-1srbsqt\">Pinned Data helper<select aria-label=\"Pinned Data helper\" class=\"svelte-1srbsqt\"><option class=\"svelte-1srbsqt\">Choose an existing item/result helper</option><!></select></label><p class=\"svelte-1srbsqt\">Helpers use exact pinned versions with Data item and result ports. Set iteration mode and requestBoundPerIteration in the controls below.</p>", 1), ff = /* @__PURE__ */ G("<div class=\"svelte-1srbsqt\"><!></div>"), pf = /* @__PURE__ */ G("<div class=\"pc-workspace-overlay svelte-1srbsqt\"><div class=\"pc-workspace-dialog pc-configure-node svelte-1srbsqt\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Configure node\" tabindex=\"-1\"><header class=\"svelte-1srbsqt\"><h2 class=\"svelte-1srbsqt\"> </h2><button type=\"button\" aria-label=\"Close node configuration\" class=\"svelte-1srbsqt\">×</button></header> <p class=\"svelte-1srbsqt\">Complete the required settings before creating the node. Cancel leaves the graph unchanged.</p> <form class=\"svelte-1srbsqt\"><label class=\"svelte-1srbsqt\">Stage<select aria-label=\"Node stage\" class=\"svelte-1srbsqt\"><option class=\"svelte-1srbsqt\">Preparation</option><option class=\"svelte-1srbsqt\">Response</option></select></label> <!> <!> <label class=\"svelte-1srbsqt\">Declared node controls<textarea aria-label=\"Node controls JSON\" rows=\"14\" maxlength=\"200000\" class=\"svelte-1srbsqt\"></textarea></label> <!> <footer class=\"svelte-1srbsqt\"><button type=\"button\" class=\"svelte-1srbsqt\">Cancel</button><button type=\"submit\" class=\"svelte-1srbsqt\"> </button></footer></form></div></div>");
function mf(e, t) {
	Ue(t, !0);
	let n, r = /* @__PURE__ */ I(""), i = /* @__PURE__ */ I("pre"), a = /* @__PURE__ */ I(""), o = /* @__PURE__ */ I(""), s = /* @__PURE__ */ I(!1), c = /* @__PURE__ */ I(""), l = "", u = 0, d = /* @__PURE__ */ F(() => t.view.operation === "read-file" || t.view.operation === "story-clock" || t.view.operation === "commit-outcomes");
	Cn(() => {
		if (t.view.key === l) return;
		l = t.view.key, u++, L(r, t.view.controls, !0), L(i, t.view.phase, !0), L(s, !1), L(c, "");
		try {
			let e = JSON.parse(H(r));
			L(a, e.targetId ?? e.clockId ?? "", !0), L(o, t.view.helpers.find((t) => JSON.stringify(t.ref) === JSON.stringify(e.helper))?.key ?? "", !0);
		} catch {
			L(a, ""), L(o, "");
		}
		let e = l;
		mr().then(() => {
			t.view.key === e && n?.querySelector("select,textarea,input")?.focus({ preventScroll: !0 });
		});
	}), Fi(() => {
		let e = document.activeElement;
		return () => e?.focus({ preventScroll: !0 });
	});
	function f(e, t) {
		try {
			let n = JSON.parse(H(r));
			if (!n || Array.isArray(n) || typeof n != "object") throw Error();
			n[e] = t, L(r, JSON.stringify(n, null, 2), !0), L(c, "");
		} catch {
			L(c, "Use a JSON object before selecting a configured value.");
		}
	}
	async function p(e) {
		if (e.preventDefault(), !t.actions || H(s)) return;
		let n = t.view.key, a = ++u;
		L(s, !0), L(c, "");
		try {
			let e = await t.actions.apply(n, H(r), H(i));
			n === t.view.key && a === u && !e?.ok && L(c, (e?.error ? e.error.code + ": " + e.error.message : void 0) ?? "The node could not be prepared.", !0);
		} catch {
			n === t.view.key && a === u && L(c, "The node could not be prepared.");
		} finally {
			n === t.view.key && a === u && L(s, !1);
		}
	}
	function m(e) {
		if (e.stopPropagation(), e.key === "Escape" && (e.preventDefault(), t.actions?.cancel(t.view.key)), e.key === "Tab") {
			let t = [...n.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)")], r = t[0], i = t.at(-1);
			e.shiftKey && document.activeElement === r && (e.preventDefault(), i?.focus()), !e.shiftKey && document.activeElement === i && (e.preventDefault(), r?.focus());
		}
	}
	var h = pf(), g = R(h), _ = R(g), v = R(_), y = R(v);
	P(v);
	var b = B(v);
	P(_);
	var x = B(_, 4), S = R(x), C = B(R(S)), w = R(C);
	w.value = w.__value = "pre";
	var T = B(w);
	T.value = T.__value = "post", P(C), P(S);
	var E = B(S, 2), D = (e) => {
		var n = uf(), r = z(n), i = B(R(r)), o = R(i);
		o.value = o.__value = "", Y(B(o), 17, () => t.view.targets.filter((e) => !["story-clock", "commit-outcomes"].includes(t.view.operation) || e.format === "json"), (e) => e.targetId, (e, t) => {
			var n = cf(), r = R(n);
			P(n);
			var i = {};
			V(() => {
				q(r, `${H(t).name ?? ""} (${H(t).targetId ?? ""})`), i !== (i = H(t).targetId) && (n.value = (n.__value = H(t).targetId) ?? "");
			}), K(e, n);
		}), P(i), P(r);
		var c = B(r), l = (e) => {
			K(e, lf());
		};
		J(c, (e) => {
			t.view.targets.length || e(l);
		}), V(() => i.disabled = H(s)), W("change", i, () => f(t.view.operation === "story-clock" ? "clockId" : "targetId", H(a))), vi(i, () => H(a), (e) => L(a, e)), K(e, n);
	};
	J(E, (e) => {
		H(d) && e(D);
	});
	var O = B(E, 2), k = (e) => {
		var n = df(), r = z(n), i = B(R(r)), a = R(i);
		a.value = a.__value = "", Y(B(a), 17, () => t.view.helpers, (e) => e.key, (e, t) => {
			var n = cf(), r = R(n);
			P(n);
			var i = {};
			V(() => {
				q(r, `${H(t).label ?? ""}${H(t).stateful ? " (projected state)" : ""}`), i !== (i = H(t).key) && (n.value = (n.__value = H(t).key) ?? "");
			}), K(e, n);
		}), P(i), P(r), Me(), V(() => i.disabled = H(s)), W("change", i, () => {
			let e = t.view.helpers.find((e) => e.key === H(o));
			e && f("helper", e.ref);
		}), vi(i, () => H(o), (e) => L(o, e)), K(e, n);
	};
	J(O, (e) => {
		t.view.operation === "for-each" && e(k);
	});
	var A = B(O, 2), j = B(R(A));
	at(j), P(A);
	var M = B(A, 2), ee = (e) => {
		var t = ff();
		go(R(t), { get issue() {
			return H(c);
		} }), P(t), K(e, t);
	};
	J(M, (e) => {
		H(c) && e(ee);
	});
	var te = B(M, 2), ne = R(te), re = B(ne), ie = R(re, !0);
	P(re), P(te), P(x), P(g), Ni(g, (e) => n = e, () => n), P(h), V(() => {
		q(y, `Configure ${t.view.title ?? ""}`), C.disabled = t.view.phaseLocked || H(s), j.disabled = H(s), re.disabled = !t.actions || H(s), q(ie, H(s) ? "Preparing…" : "Create node");
	}), U("keydown", g, m, !0), U("paste", g, (e) => e.stopPropagation()), W("click", b, () => t.actions?.cancel(t.view.key)), U("submit", x, p), vi(C, () => H(i), (e) => L(i, e)), ki(j, () => H(r), (e) => L(r, e)), W("click", ne, () => t.actions?.cancel(t.view.key)), K(e, h), We();
}
Er(["click", "change"]);
//#endregion
//#region ui/DocumentPrompt.svelte
var hf = /* @__PURE__ */ G("<p class=\"svelte-ppe66w\">Save keeps these changes in the current file. Don't Save continues and discards the unsaved changes to this document. Cancel keeps this document open.</p>"), gf = /* @__PURE__ */ G("<p class=\"svelte-ppe66w\">Save As creates a JSON copy of this workflow. To switch documents after saving, repeat the action and choose Don't Save. Don't Save discards unsaved changes; Cancel keeps this document open.</p>"), _f = /* @__PURE__ */ G("<div class=\"pc-workspace-overlay\"><div class=\"pc-workspace-dialog pc-document-prompt svelte-ppe66w\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Save workflow changes?\" tabindex=\"-1\"><h2 class=\"svelte-ppe66w\">Save workflow changes?</h2> <p class=\"svelte-ppe66w\"><strong class=\"svelte-ppe66w\"> </strong> has unsaved changes.</p> <!> <footer class=\"svelte-ppe66w\"><button type=\"button\" class=\"svelte-ppe66w\"> </button><button type=\"button\" class=\"svelte-ppe66w\">Don't Save</button><button type=\"button\" class=\"svelte-ppe66w\">Cancel</button></footer></div></div>");
function vf(e, t) {
	Ue(t, !0);
	let n = Pi(t, "native", 3, !0), r, i;
	Fi(() => {
		let e = document.activeElement;
		return i.focus({ preventScroll: !0 }), () => e?.focus({ preventScroll: !0 });
	});
	function a(e) {
		if (e.stopPropagation(), e.key === "Escape" && (e.preventDefault(), t.actions?.choose("cancel")), e.key === "Tab") {
			let t = [...r.querySelectorAll("button:not(:disabled)")], n = t.indexOf(document.activeElement);
			e.shiftKey && n <= 0 && (e.preventDefault(), t.at(-1)?.focus()), !e.shiftKey && (n < 0 || n === t.length - 1) && (e.preventDefault(), t[0]?.focus());
		}
	}
	var o = _f(), s = R(o), c = B(R(s), 2), l = R(c), u = R(l, !0);
	P(l), Me(), P(c);
	var d = B(c, 2), f = (e) => {
		K(e, hf());
	}, p = (e) => {
		K(e, gf());
	};
	J(d, (e) => {
		n() ? e(f) : e(p, -1);
	});
	var m = B(d, 2), h = R(m), g = R(h, !0);
	P(h);
	var _ = B(h), v = B(_);
	Ni(v, (e) => i = e, () => i), P(m), P(s), Ni(s, (e) => r = e, () => r), P(o), V(() => {
		q(u, t.view.name), q(g, n() ? "Save" : "Save As…");
	}), U("keydown", s, a, !0), U("paste", s, (e) => e.stopPropagation(), !0), W("click", h, () => t.actions?.choose("save")), W("click", _, () => t.actions?.choose("discard")), W("click", v, () => t.actions?.choose("cancel")), K(e, o), We();
}
Er(["click"]);
//#endregion
//#region ui/NodeSearch.svelte
var yf = /* @__PURE__ */ G("<label class=\"pc-context-check svelte-golf61\"><input type=\"checkbox\" class=\"svelte-golf61\"/>Context sensitive</label>"), bf = /* @__PURE__ */ G("<span class=\"pc-search-context svelte-golf61\"> </span>"), xf = /* @__PURE__ */ G("<label class=\"pc-search-field svelte-golf61\"><input type=\"search\" aria-label=\"Search nodes and subgraphs\" placeholder=\"Search…\" autocomplete=\"off\" role=\"combobox\" aria-expanded=\"true\" class=\"svelte-golf61\"/></label> <!> <!>", 1), Sf = /* @__PURE__ */ G("<p class=\"pc-search-context svelte-golf61\">Choose the named port to connect.</p>"), Cf = /* @__PURE__ */ G("<small style=\"display:block;white-space:normal\"> </small>"), wf = /* @__PURE__ */ G("<button type=\"button\" class=\"pc-search-result svelte-golf61\" role=\"option\"><span class=\"svelte-golf61\"> <!></span> <span class=\"pc-family svelte-golf61\"> </span></button>"), Tf = /* @__PURE__ */ G("<p class=\"pc-empty svelte-golf61\"> </p>"), Ef = /* @__PURE__ */ G("<p class=\"pc-feedback svelte-golf61\" role=\"status\"> </p>"), Df = /* @__PURE__ */ G("<div class=\"pc-node-search svelte-golf61\" role=\"dialog\" aria-modal=\"false\" tabindex=\"-1\"><!> <div class=\"pc-search-results svelte-golf61\" role=\"listbox\"></div> <!></div>");
function Of(e, t) {
	let n = Rr();
	Ue(t, !0);
	let r = Pi(t, "view", 3, null), i = Pi(t, "actions", 19, () => ({})), a = /* @__PURE__ */ I(void 0), o = /* @__PURE__ */ I(void 0), s = /* @__PURE__ */ I(""), c = /* @__PURE__ */ I(0), l = /* @__PURE__ */ I(8), u = /* @__PURE__ */ I(8), d, f, p = (e) => [
		e.label,
		e.family,
		e.purpose ?? "",
		e.shortcode ?? "",
		...e.searchAliases ?? []
	].join(" ").toLocaleLowerCase(), m = /* @__PURE__ */ F(() => (r()?.choices ?? []).filter((e) => p(e).includes(H(s).toLocaleLowerCase().trim()))), h = /* @__PURE__ */ F(() => r()?.mode === "ports" ? r().ports : H(m)), g = (e) => "id" in e ? e.id : e.portId, _ = (e) => !!r()?.readOnly || "disabledReason" in e && !!e.disabledReason, v = /* @__PURE__ */ F(() => H(h).filter((e) => !_(e))), y = /* @__PURE__ */ F(() => H(v)[Math.min(H(c), Math.max(0, H(v).length - 1))]), b = (e) => ({
		Input: "#96ad52",
		Shaping: "#589aab",
		Surface: "#92c9ad",
		Transpose: "#9080b6",
		Derive: "#b65b9e",
		Output: "#c96d82",
		Subgraphs: "#a3aa99"
	})[e] ?? "#a1a59b";
	function x() {
		if (!r() || !H(a)) return;
		let e = H(a).getBoundingClientRect(), t = document.documentElement.clientWidth || window.innerWidth, n = document.documentElement.clientHeight || window.innerHeight;
		L(l, Math.max(8, Math.min(r().screenAnchor.x, t - e.width - 8)), !0), L(u, Math.max(8, Math.min(r().screenAnchor.y, n - e.height - 8)), !0);
	}
	Cn(() => {
		let e = r()?.key, t = r()?.mode, n = r()?.screenAnchor;
		if (e === void 0 || !n) return;
		let i = d !== e || f !== t;
		d !== e && L(s, ""), i && L(c, 0), d = e, f = t, mr().then(() => {
			r()?.key === e && r().mode === t && (x(), i && (t === "nodes" ? H(o)?.focus() : (H(a)?.querySelector("[data-port]:not(:disabled)") ?? H(a))?.focus()));
		});
	});
	function S(e) {
		e && r() && !_(e) && (r().mode === "ports" && "portId" in e ? i().choosePort?.(e.portId) : r().mode === "nodes" && "id" in e && i().choose?.(e.id));
	}
	function C(e) {
		let t = e.currentTarget;
		!r() || r().readOnly || !r().origin ? t.checked = !!r()?.contextSensitive : i().setContextSensitive?.(t.checked);
	}
	function w(e) {
		e.stopPropagation(), e.key === "Escape" ? (e.preventDefault(), i().dismiss?.()) : [
			"ArrowDown",
			"ArrowUp",
			"Home",
			"End"
		].includes(e.key) ? (e.preventDefault(), L(c, e.key === "Home" ? 0 : e.key === "End" ? Math.max(0, H(v).length - 1) : H(v).length ? (H(c) + (e.key === "ArrowDown" ? 1 : -1) + H(v).length) % H(v).length : 0, !0)) : e.key === "Enter" && (e.preventDefault(), S(H(y)));
	}
	Cn(() => {
		if (!r()) return;
		let e = (e) => {
			H(a) && !H(a).contains(e.target) && i().dismiss?.();
		};
		return window.addEventListener("pointerdown", e, !0), () => window.removeEventListener("pointerdown", e, !0);
	});
	var T = Lr();
	U("resize", an, x);
	var E = z(T), D = (e) => {
		var t = Df();
		let i;
		var d = R(t), f = (e) => {
			var t = xf(), i = z(t), a = R(i);
			X(a), Ni(a, (e) => L(o, e), () => H(o)), P(i);
			var l = B(i, 2), u = (e) => {
				var t = yf(), n = R(t);
				X(n), Me(), P(t), V(() => {
					Ti(n, r().contextSensitive), n.disabled = r().readOnly;
				}), W("change", n, C), K(e, t);
			};
			J(l, (e) => {
				r().origin && e(u);
			});
			var d = B(l, 2), f = (e) => {
				var t = bf(), n = R(t, !0);
				P(t), V(() => q(n, (r().origin.dir === "out" ? "Accepts " : "Produces ") + r().origin.kind)), K(e, t);
			};
			J(d, (e) => {
				r().origin && e(f);
			}), V((e) => {
				Z(a, "aria-controls", n + "-results"), Z(a, "aria-activedescendant", e);
			}, [() => H(y) ? n + "-item-" + H(h).indexOf(H(y)) : void 0]), W("input", a, () => L(c, 0)), ki(a, () => H(s), (e) => L(s, e)), K(e, t);
		}, p = (e) => {
			K(e, Sf());
		};
		J(d, (e) => {
			r().mode === "nodes" ? e(f) : e(p, -1);
		});
		var m = B(d, 2);
		Y(m, 21, () => H(h), (e) => g(e), (e, t) => {
			var r = wf(), i = R(r), a = R(i, !0), o = B(a), s = (e) => {
				var n = Cf(), r = R(n, !0);
				P(n), V(() => q(r, H(t).disabledReason)), K(e, n);
			};
			J(o, (e) => {
				"disabledReason" in H(t) && H(t).disabledReason && e(s);
			}), P(i);
			var l = B(i, 1, !0);
			l.nodeValue = " ";
			var u = B(l);
			let d;
			var f = R(u, !0);
			P(u), P(r), V((e, n, i, o) => {
				Z(r, "aria-selected", H(y) === H(t)), Z(r, "id", e), Z(r, "data-choice", "id" in H(t) ? H(t).id : void 0), Z(r, "data-port", "portId" in H(t) ? H(t).portId : void 0), r.disabled = n, Z(r, "title", "disabledReason" in H(t) ? H(t).disabledReason : void 0), q(a, i), d = hi(u, "", d, o), q(f, "family" in H(t) ? H(t).family : H(t).kind);
			}, [
				() => n + "-item-" + H(h).indexOf(H(t)),
				() => _(H(t)),
				() => H(t).label || g(H(t)),
				() => ({ color: "family" in H(t) ? b(H(t).family) : void 0 })
			]), W("click", r, () => S(H(t))), U("focus", r, () => {
				let e = H(v).indexOf(H(t));
				e >= 0 && L(c, e, !0);
			}), K(e, r);
		}, (e) => {
			var t = Tf(), n = R(t, !0);
			P(t), V((e) => q(n, e), [() => r().mode === "ports" ? "This node has no compatible ports for this connection." : r().contextSensitive && r().origin ? "No compatible nodes match. Clear the search or turn off Context sensitive to browse all nodes." : H(s).trim() ? "No nodes match your search. Try another name or clear the search." : "No nodes are available in this view."]), K(e, t);
		}), P(m);
		var x = B(m, 2), T = (e) => {
			var t = Ef(), n = R(t, !0);
			P(t), V(() => q(n, r().feedback)), K(e, t);
		};
		J(x, (e) => {
			r().feedback && e(T);
		}), P(t), Ni(t, (e) => L(a, e), () => H(a)), V(() => {
			Z(t, "aria-label", r().mode === "ports" ? "Choose connection port" : "Add node"), i = hi(t, "", i, {
				left: `${H(l) ?? ""}px`,
				top: `${H(u) ?? ""}px`
			}), Z(m, "id", n + "-results"), Z(m, "aria-label", r().mode === "ports" ? "Compatible ports" : "Nodes and subgraphs");
		}), W("keydown", t, w), K(e, t);
	};
	J(E, (e) => {
		r() && e(D);
	}), K(e, T), We();
}
Er([
	"keydown",
	"input",
	"change",
	"click"
]);
//#endregion
//#region ui/PinMenu.svelte
var kf = /* @__PURE__ */ G("<p class=\"pc-kind svelte-i73q0t\"> </p>"), Af = /* @__PURE__ */ G("<button type=\"button\" class=\"pc-pin-action svelte-i73q0t\"> </button><!>", 1), jf = /* @__PURE__ */ G("<p class=\"pc-empty svelte-i73q0t\">No attached links.</p>"), Mf = /* @__PURE__ */ G("<div class=\"pc-pin-menu svelte-i73q0t\" role=\"dialog\" aria-label=\"Pin actions\" aria-modal=\"false\" tabindex=\"-1\"><div class=\"pc-menu-head svelte-i73q0t\"><h2 class=\"svelte-i73q0t\"> </h2><button type=\"button\" aria-label=\"Close pin actions\" class=\"svelte-i73q0t\">Close</button></div> <p class=\"pc-kind svelte-i73q0t\"> </p> <!></div>");
function Nf(e, t) {
	let n = Rr();
	Ue(t, !0);
	let r = Pi(t, "view", 3, null), i = Pi(t, "actions", 19, () => ({})), a = /* @__PURE__ */ I(void 0), o = /* @__PURE__ */ I(8), s = /* @__PURE__ */ I(8), c, l = (e) => !!e.disabled || !!r()?.readOnly && e.capability !== "navigation";
	function u() {
		if (!r() || !H(a)) return;
		let e = H(a).getBoundingClientRect(), t = document.documentElement.clientWidth || window.innerWidth, n = document.documentElement.clientHeight || window.innerHeight;
		L(o, Math.max(8, Math.min(r().screenAnchor.x, t - e.width - 8)), !0), L(s, Math.max(8, Math.min(r().screenAnchor.y, n - e.height - 8)), !0);
	}
	Cn(() => {
		let e = r()?.key, t = r()?.screenAnchor;
		if (e === void 0 || !t) return;
		let n = c !== e;
		c = e, mr().then(() => {
			r()?.key === e && (u(), n && (H(a)?.querySelector("[data-entry]:not(:disabled)") ?? H(a))?.focus());
		});
	});
	function d(e) {
		r() && !l(e) && i().pick?.(e.id);
	}
	function f(e) {
		if (e.stopPropagation(), e.key === "Escape") {
			e.preventDefault(), i().dismiss?.();
			return;
		}
		let t = [...H(a)?.querySelectorAll("[data-entry]:not(:disabled)") ?? []], n = t.indexOf(document.activeElement);
		if ([
			"ArrowDown",
			"ArrowUp",
			"Home",
			"End"
		].includes(e.key)) e.preventDefault(), t[e.key === "Home" ? 0 : e.key === "End" ? t.length - 1 : (n + (e.key === "ArrowDown" ? 1 : -1) + t.length) % t.length]?.focus();
		else if (e.key === "Enter") {
			let t = r()?.entries.find((e) => e.id === document.activeElement?.dataset.entry);
			t && (e.preventDefault(), d(t));
		}
	}
	var p = Lr();
	U("resize", an, u);
	var m = z(p), h = (e) => {
		var t = Mf();
		let c;
		var u = R(t), p = R(u), m = R(p, !0);
		P(p);
		var h = B(p);
		P(u);
		var g = B(u, 2), _ = R(g);
		P(g), Y(B(g, 2), 17, () => r().entries, (e) => e.id, (e, t) => {
			var r = Af(), i = z(r), a = R(i, !0);
			P(i);
			var o = B(i), s = (e) => {
				var r = kf(), i = R(r, !0);
				P(r), V(() => {
					Z(r, "id", n + "-reason-" + H(t).id), q(i, H(t).reason);
				}), K(e, r);
			};
			J(o, (e) => {
				H(t).reason && e(s);
			}), V((e) => {
				Z(i, "data-entry", H(t).id), i.disabled = e, Z(i, "aria-describedby", H(t).reason ? n + "-reason-" + H(t).id : void 0), q(a, H(t).label);
			}, [() => l(H(t))]), W("click", i, () => d(H(t))), K(e, r);
		}, (e) => {
			K(e, jf());
		}), P(t), Ni(t, (e) => L(a, e), () => H(a)), V(() => {
			c = hi(t, "", c, {
				left: `${H(o) ?? ""}px`,
				top: `${H(s) ?? ""}px`
			}), q(m, r().title), q(_, `${r().kind ?? ""}${r().readOnly ? " · Read only" : ""}`);
		}), W("keydown", t, f), W("click", h, () => i().dismiss?.()), K(e, t);
	};
	J(m, (e) => {
		r() && e(h);
	}), K(e, p), We();
}
Er(["keydown", "click"]);
//#endregion
//#region src/ui/node-palette.js
var Pf = "M3 7 12 2l9 5v10l-9 5-9-5ZM3 7l9 5 9-5M12 12v10", Ff = "M3 6l4-2 4 2v5l-4 2-4-2ZM3 6l4 2 4-2M7 8v5M13 6l4-2 4 2v5l-4 2-4-2ZM13 6l4 2 4-2M17 8v5M8 15l4-2 4 2v5l-4 2-4-2ZM8 15l4 2 4-2M12 17v5", If = Object.freeze([
	{
		name: "Input",
		color: "#96ad52",
		icon: Pf
	},
	{
		name: "Shaping",
		color: "#589aab",
		icon: "M20 8a8 8 0 1 0 0 8M20 3v5h-5"
	},
	{
		name: "Surface",
		color: "#92c9ad",
		icon: "M3 14L14 6l7 4-11 8Z"
	},
	{
		name: "Transpose",
		color: "#9080b6",
		icon: "M3 7h18m-4-4 4 4-4 4M21 17H3m4-4-4 4 4 4"
	},
	{
		name: "Derive",
		color: "#b65b9e",
		icon: "M5 20v-6M12 20V8M19 20V3"
	},
	{
		name: "Introspection",
		color: "#b39d71",
		icon: "M21 12s-4-7-9-7-9 7-9 7 4 7 9 7 9-7 9-7ZM15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0"
	},
	{
		name: "Output",
		color: "#c96d82",
		icon: Pf
	},
	{
		name: "Subgraphs",
		color: "#a3aa99",
		icon: Ff
	}
].map((e) => Object.freeze(e))), Lf = {
	Sources: "M14 2H5v20h14V7Zm0 0v5h5M2 13h10m-3-3 3 3-3 3",
	Context: "M3 5h18M6 12h12M9 19h6",
	Planning: "M4 5h8a4 4 0 0 1 0 8H8a4 4 0 0 0 0 8h12m-3-3 3 3-3 3",
	Assembly: "M3 5h6v6H3ZM15 5h6v6h-6ZM9 17h6v5H9M6 11v3h12v-3m-6 3v3",
	Revision: "m4 17 12-12 3 3L7 20H4Zm10-10 3 3M11 21h10",
	Analysis: "M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5M3 12h18",
	Validation: "m3 5 2 2 3-3M11 5h10m-18 7 2 2 3-3M11 12h10M3 19h5m3 0h10",
	Parsing: "m7 3-4 9 4 9m10-18 4 9-4 9M10 12h4",
	Extraction: "M3 5h18M3 12h8M3 19h8m4-4 6 4-6 4m6-4h-7",
	Guidance: "M5 2h10l4 4v16H5ZM15 2v4h4M8 11h8m-8 5h6",
	Review: "m2 12 4 4 8-9m-3 8 3 3 8-10",
	Delivery: "m2 11 20-9-8 20-4-8Zm8 3L22 2",
	Library: Ff,
	Routing: "M3 12h18m-7-7 7 7-7 7",
	Blocks: Pf,
	Reflect: "M21 12s-4-7-9-7-9 7-9 7 4 7 9 7 9-7 9-7ZM15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0",
	Internalize: "M4 4h16v16H4M8 8l4 4 4-4M12 12v5",
	Express: "M4 4h16v12H9l-5 4ZM8 8h8M8 12h5",
	Memory: "M5 3h14v18H5ZM8 7h8M8 11h8M8 15h5",
	State: "M3 12h4l3-7 4 14 3-7h4"
}, Rf = Object.freeze(Object.fromEntries(Object.entries(Lf).map(([e, t]) => [e, Object.freeze({
	name: e,
	icon: t
})]))), zf = {
	"subgraph-input": [
		"Input",
		"si",
		"M3 12h18m-7-7 7 7-7 7"
	],
	"subgraph-output": [
		"Output",
		"so",
		"M21 12H3m7-7-7 7 7 7"
	],
	text: [
		"Sources",
		"tx",
		"M3 4h18M12 4v16M7 20h10"
	],
	"file-input": [
		"Sources",
		"fi",
		"M14 2H5v20h14V7Zm0 0v5h5M8 12h8M8 16h8"
	],
	"prompt-source": [
		"Sources",
		"pr",
		"M8 3h13v13h-8l-5 5v-7M2 8h12m-3-3 3 3-3 3"
	],
	"scene-context": [
		"Sources",
		"sc",
		"M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"
	],
	"reply-snapshot": [
		"Sources",
		"rs",
		"M3 6h4l2-3h6l2 3h4v15H3ZM16 13a4 4 0 1 0-8 0 4 4 0 0 0 8 0"
	],
	"smart-compactor": [
		"Context",
		"cp",
		"M3 3l6 6M3 9h6V3M21 21l-6-6m0 6v-6h6M3 21l6-6M3 15h6v6M21 3l-6 6m0-6v6h6"
	],
	"context-join": [
		"Context",
		"cj",
		"M3 5h5v5h8V5h5M3 19h5v-5h8v5h5M8 12h8"
	],
	"response-plan": [
		"Planning",
		"rp",
		Lf.Planning
	],
	compose: [
		"Assembly",
		"co",
		Lf.Assembly
	],
	repair: [
		"Revision",
		"rr",
		"m4 19 11-11 3 3L7 22ZM3 4h6M6 1v6m11-5v4m-2-2h4"
	],
	"style-transfer": [
		"Reference voice",
		"st",
		"M3 7h18m-4-4 4 4-4 4M5 17h14M8 14l-3 3 3 3"
	],
	"format-transfer": [
		"Reference format",
		"ft",
		"M4 3h7v7H4zM13 14h7v7h-7zM14 6h6m-3-3 3 3-3 3M4 17h6"
	],
	"terminology-map": [
		"Canonical terms",
		"tm",
		"M3 5h7v14H3zM14 5h7v14h-7zM10 12h4m-2-2 2 2-2 2"
	],
	"text-rules": [
		"Revision",
		"tr",
		"M3 5h18M8 5v16m-4 0h8M16 12h5m-2-2 2 2-2 2M16 18h5"
	],
	"pattern-scan": [
		"Analysis",
		"ps",
		"M16 10a6 6 0 1 0-12 0 6 6 0 0 0 12 0Zm-1 5 6 6"
	],
	"validate-patches": [
		"Validation",
		"vp",
		Lf.Validation
	],
	"json-decode": [
		"Parsing",
		"jd",
		Lf.Parsing
	],
	"select-fields": [
		"Extraction",
		"sf",
		Lf.Extraction
	],
	guidance: [
		"Guidance",
		"gd",
		"M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0ZM15 9l-2 4-4 2 2-4Z"
	],
	"review-gate": [
		"Review",
		"rg",
		"M2 10s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6ZM13 10a2 2 0 1 0-4 0 2 2 0 0 0 4 0m1 9 3 3 5-6"
	],
	"apply-reply": [
		"Delivery",
		"ar",
		Lf.Delivery
	],
	reroute: [
		"Routing",
		"rt",
		Lf.Routing
	],
	reflect: [
		"Reflect",
		"rf",
		Lf.Reflect
	],
	internalize: [
		"Internalize",
		"in",
		Lf.Internalize
	],
	express: [
		"Express",
		"ex",
		Lf.Express
	],
	context: [
		"Context",
		"cx",
		Lf.Context
	],
	memory: [
		"Memory",
		"mm",
		Lf.Memory
	],
	state: [
		"State",
		"sv",
		Lf.State
	],
	condition: [
		"Validation",
		"cn",
		"M12 2 22 12 12 22 2 12Zm-4 10 3 3 5-6"
	],
	branch: [
		"Routing",
		"br",
		"M3 12h6m0 0 6-7h6m-4-3 4 3-4 3M9 12l6 7h6m-4-3 4 3-4 3"
	],
	join: [
		"Assembly",
		"jn",
		"M3 5h5l6 7-6 7H3M14 12h7m-4-4 4 4-4 4"
	],
	collect: [
		"Assembly",
		"cl",
		"M3 14v7h18v-7M7 3v12m-3-3 3 3 3-3M17 3v12m-3-3 3 3 3-3"
	],
	"confidence-gate": [
		"Validation",
		"cg",
		"M4 18a9 9 0 1 1 16 0M12 12l5-5M5 19h14M8 19v3m8-3v3"
	],
	"for-each": [
		"Routing",
		"fe",
		"M20 7a8 8 0 0 0-14-2L3 8m0-5v5h5M4 17a8 8 0 0 0 14 2l3-3m0 5v-5h-5M8 12h1m3 0h1m3 0h1"
	],
	decision: [
		"Analysis",
		"dc",
		"M4 3h16v18H4ZM7 8l2 2 3-4M14 8h3M7 15h3m4 0h3"
	],
	combine: [
		"Assembly",
		"cb",
		"M3 3h6v7H3ZM3 14h6v7H3ZM9 6h3l4 6-4 6H9M16 12h5m-3-3 3 3-3 3"
	],
	append: [
		"Assembly",
		"ap",
		"M14 2H4v20h14V6Zm0 0v4h4M7 10h5m-5 4h5M18 12v8m-4-4h8"
	],
	"render-notes": [
		"Delivery",
		"rn",
		"M4 3h16v12l-6 6H4Zm10 18v-6h6M8 7h8M8 11h8M8 15h3"
	],
	enrich: [
		"Assembly",
		"en",
		"M3 5h7M3 12h10M3 19h16M17 2l1.5 4.5L23 8l-4.5 1.5L17 14l-1.5-4.5L11 8l4.5-1.5Z"
	],
	"draft-text": [
		"Extraction",
		"dt",
		"M14 2H4v20h16V8Zm0 0v6h6M7 11h10M12 11v7M9 18h6"
	],
	extract: [
		"Extraction",
		"ec",
		"M3 3h18l-7 8v4h-4v-4ZM8 19h8v3H8Z"
	],
	"model-call": [
		"Analysis",
		"mc",
		"M8 3H4v14h5l-5 4M4 17h16V9M16 2l1.5 4.5L22 8l-4.5 1.5L16 14l-1.5-4.5L10 8l4.5-1.5Z"
	],
	"revise-draft": [
		"Revision",
		"rv",
		"M13 2H4v20h6M13 2v5h5V5ZM7 11h5m-5 4h3M12 18l7-7 3 3-7 7h-3Zm5-5 3 3"
	],
	"player-event-source": [
		"Sources",
		"pe",
		"M11 6a3 3 0 1 0-6 0 3 3 0 0 0 6 0M2 21v-4a6 6 0 0 1 12 0v4M19 8l-4 6h4l-1 7 5-8h-4Z"
	],
	"on-send": [
		"Sources",
		"os",
		"M3 5h18v14H3ZM3 5l9 7 9-7M12 14v8m-3-3 3 3 3-3"
	],
	"generate-reply": [
		"Sources",
		"gr",
		"M20 9V3H4v14h5l-5 4M14 12a5 5 0 1 0 7 7m0-5v5h-5"
	],
	"review-publish": [
		"Delivery",
		"pb",
		"M8 3H4v18h11M8 2h7v4H8ZM7 11l2 2 4-5M15 15h7m-3-3 3 3-3 3"
	],
	format: [
		"Parsing",
		"fm",
		"M5 3H2v18h3M19 3h3v18h-3M8 6h8M8 10h5M8 14h8M8 18h5"
	],
	"read-file": [
		"Sources",
		"rd",
		"M14 2H4v20h16v-5M14 2v5h6V7ZM8 12h14m-4-4 4 4-4 4"
	],
	"write-file": [
		"Delivery",
		"wf",
		"M14 2H6v7M6 17v5h14V8L14 2M14 2v6h6M2 13h12m-4-4 4 4-4 4"
	],
	"project-document": [
		"Assembly",
		"pd",
		"M13 2H3v12h14V6Zm0 0v4h4M6 9h7M8 18h13v4H8ZM11 14v4m-3-3 3 3 3-3"
	],
	"commit-clock": [
		"Delivery",
		"cc",
		"M20 10a8 8 0 1 0-8 10M12 5v7l-4 2M14 19l3 3 5-6"
	],
	"story-clock": [
		"Sources",
		"ck",
		"M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0ZM12 6v6l4 3"
	],
	"time-trigger": [
		"Routing",
		"tt",
		"M19 13a7 7 0 1 0-14 0 7 7 0 0 0 14 0ZM12 9v4l3 2M2 5l4-3m12 0 4 3M7 19l-2 3m12-3 2 3"
	],
	"advance-time": [
		"Routing",
		"at",
		"M15 5a8 8 0 1 0 0 14M10 6v6l-3 2M14 12h8m-4-4 4 4-4 4"
	],
	"actor-context": [
		"Context",
		"ac",
		"M5 3H2v18h3M19 3h3v18h-3M15 8a3 3 0 1 0-6 0 3 3 0 0 0 6 0M7 19v-2a5 5 0 0 1 10 0v2"
	],
	"draft-event-source": [
		"Sources",
		"de",
		"M14 2H4v20h16V8Zm0 0v6h6M12 10l-4 5h4l-1 5 6-7h-5Z"
	],
	"event-normalize": [
		"Parsing",
		"ev",
		"M2 4h6M4 12h4M3 20h5M10 12h4m-2-2 2 2-2 2M17 4h5M17 12h5M17 20h5"
	],
	"prompted-memory": [
		"Memory",
		"pm",
		"M3 3h18v13h-8l-6 5v-5H3ZM7 7h4v6H7Zm6 0h4v6h-4M11 7l1 1 1-1"
	],
	"item-mention-trigger": [
		"Routing",
		"mt",
		"M3 3h9l9 9-9 9-9-9ZM7 7h.01M12 8v4h-2m7 1v4h-2"
	],
	"item-use-trigger": [
		"Routing",
		"ut",
		"M3 8v13h13l5-5M3 8l5-5h5M17 2l-5 8h5l-1 7 6-10h-5Z"
	],
	"confirm-events": [
		"Validation",
		"ce",
		"M3 2h18v20H3ZM6 7l2 2 3-4M14 7h4M6 16l2 2 3-4M14 16h4"
	],
	"current-holder": [
		"Context",
		"ch",
		"M7 3h8v7H7ZM2 14h4l3-3h4l2 3h5a2 2 0 0 1 1 4l-8 4-7-3H2ZM9 14h6"
	],
	"scene-presence": [
		"Context",
		"sp",
		"M19 9c0 5-7 13-7 13S5 14 5 9a7 7 0 1 1 14 0ZM15 9a3 3 0 1 0-6 0 3 3 0 0 0 6 0"
	],
	"character-direction": [
		"Guidance",
		"cd",
		"M12 6a3 3 0 1 0-6 0 3 3 0 0 0 6 0M3 20v-3a6 6 0 0 1 12 0v3M15 10h7m-4-4 4 4-4 4"
	],
	"parse-effect-library": [
		"Library",
		"el",
		"M3 4h4v17H3ZM9 4h4v17H9ZM17 12l4 9M17 2v6m-3-3h6"
	],
	"random-pick": [
		"Routing",
		"pk",
		"M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM7 7h.01M12 12h.01M17 17h.01"
	],
	"commit-outcomes": [
		"Delivery",
		"oc",
		"M3 3h16v10M3 3v16h9M7 7h.01M12 12h.01M14 19l3 3 5-6"
	],
	"saved-outcome": [
		"Memory",
		"ou",
		"M5 2h14v20l-7-5-7 5ZM9 7h6v6H9ZM12 10h.01"
	],
	"effect-author": [
		"Revision",
		"ea",
		"M3 21l2-7L16 3l5 5-11 11Zm2-7 5 5m-7 2 4-4M4 2v6M1 5h6M21 15v6m-3-3h6"
	],
	"stage-outcome": [
		"Assembly",
		"su",
		"M3 17v5h18v-5M7 4h10v9H7ZM12 13v5m-3-3 3 3 3-3M10 8h.01m4 1h.01"
	],
	collection: [
		"Extraction",
		"ct",
		"M21 5c0 2-4 3-9 3S3 7 3 5s4-3 9-3 9 1 9 3Zm-18 0v7c0 2 4 3 9 3s9-1 9-3V5M3 12v7c0 2 4 3 9 3s9-1 9-3v-7"
	],
	recall: [
		"Memory",
		"rc",
		"M4 8v13h15V10M7 14h8M7 18h5M7 8a7 7 0 0 1 13-2M7 3v5h5"
	],
	"hotkey-arm": [
		"Routing",
		"hk",
		"M2 7h20v14H2ZM6 11h.01m4 0h.01m4 0h.01m4 0h.01M6 17h12M17 2v3m-2-1h4"
	]
}, Bf = Object.freeze(Object.fromEntries(Object.entries(zf).map(([e, [t, n, r]]) => [e, Object.freeze({
	group: t,
	shortcode: n,
	icon: r
})]))), Vf = Object.freeze({
	group: "Blocks",
	shortcode: "",
	icon: Pf
}), Hf = (e) => Object.hasOwn(Bf, e) ? Bf[e] : Vf, Uf = /* @__PURE__ */ G("<button type=\"button\" class=\"pc-family-row\" aria-haspopup=\"menu\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path></path></svg><span> </span></button>"), Wf = /* @__PURE__ */ G("<button type=\"button\" role=\"menuitem\">‹ Families</button>"), Gf = /* @__PURE__ */ G("<input class=\"text_pole\" aria-label=\"Search nodes\" placeholder=\"Search nodes…\"/>"), Kf = /* @__PURE__ */ G("<div class=\"pc-shelf-group svelte-hk6fzp\" role=\"presentation\"> </div>"), qf = /* @__PURE__ */ G("<span class=\"pc-shelf-reason svelte-hk6fzp\"> </span>"), Jf = /* @__PURE__ */ G("<!> <button type=\"button\" role=\"menuitem\" class=\"svelte-hk6fzp\"><svg class=\"pc-leaf-icon\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path></path></svg><span class=\"pc-catalog-name\"> <!></span><small> </small></button>", 1), Yf = /* @__PURE__ */ G("<p class=\"pc-shelf-empty svelte-hk6fzp\"> </p>"), Xf = /* @__PURE__ */ G("<div role=\"menu\" tabindex=\"-1\"><!> <!> <!></div>"), Zf = /* @__PURE__ */ G("<div class=\"pc-shelf-menu pc-shelf-subgraph-menu svelte-hk6fzp\" role=\"menu\" tabindex=\"-1\"><button type=\"button\" role=\"menuitem\" data-shelf-subgraph-action=\"open\">Open saved definition</button> <button type=\"button\" role=\"menuitem\" data-shelf-subgraph-action=\"delete\">Delete</button></div>"), Qf = /* @__PURE__ */ G("<div class=\"pc-shelf-drag-preview svelte-hk6fzp\" aria-hidden=\"true\"> </div>"), $f = /* @__PURE__ */ G("<nav aria-label=\"Node families\"></nav> <!> <!> <!>", 1);
function ep(e, t) {
	Ue(t, !0);
	let n = Pi(t, "choices", 19, () => []), r = Pi(t, "readOnly", 3, !1), i, a = /* @__PURE__ */ I(null), o = /* @__PURE__ */ I(""), s = /* @__PURE__ */ I(!1), c = /* @__PURE__ */ I(""), l = /* @__PURE__ */ I(!1), u = /* @__PURE__ */ I(0), d = /* @__PURE__ */ I(0), f = null, p = 0, m = /* @__PURE__ */ I(null), h = /* @__PURE__ */ I(null), g = null, _ = If.map((e) => e.name), v = (e) => If.find((t) => t.name === e)?.color, y = null, b = null, x = null, S = /* @__PURE__ */ I(null);
	function C() {
		b !== null && clearTimeout(b), b = null;
		let e = y;
		y = null, L(S, null), document.body.classList.remove("pc-shelf-dragging"), e?.button.hasPointerCapture?.(e.pointerId) && e.button.releasePointerCapture(e.pointerId);
	}
	function w() {
		y && (b !== null && clearTimeout(b), b = null, x = y.button, document.body.classList.add("pc-shelf-dragging"), L(S, {
			title: y.entry.title,
			family: y.entry.family,
			...y.point
		}, !0));
	}
	function T(e, t) {
		if (e.button !== 0 || e.isPrimary === !1 || y || r() || !k(t.family).find((e) => e.id === t.id)?.compatible) return;
		let n = e.currentTarget;
		x = null, y = {
			entry: t,
			pointerId: e.pointerId,
			button: n,
			start: {
				x: e.clientX,
				y: e.clientY
			},
			point: {
				x: e.clientX,
				y: e.clientY
			}
		}, n.setPointerCapture?.(e.pointerId), b = setTimeout(w, 180);
	}
	function E(e) {
		y && e.pointerId === y.pointerId && (y.point = {
			x: e.clientX,
			y: e.clientY
		}, !H(S) && Math.hypot(e.clientX - y.start.x, e.clientY - y.start.y) >= 5 && w(), H(S) && (e.preventDefault(), L(S, {
			...H(S),
			...y.point
		}, !0)));
	}
	function D(e) {
		if (!y || e.pointerId !== y.pointerId) return;
		let t = y.entry, n = !!H(S), r = n ? document.elementFromPoint(e.clientX, e.clientY) : null, a = i.closest(".pc-canvas-area")?.querySelector(".pc-canvas-host");
		C(), n && (e.preventDefault(), e.stopPropagation(), r && a?.contains(r) && ae(t, {
			x: e.clientX,
			y: e.clientY
		}));
	}
	function O(e, t) {
		e.currentTarget === x && e.detail !== 0 ? x = null : ae(t);
	}
	function k(e = H(o)) {
		let r = /* @__PURE__ */ new Map();
		for (let t of n().filter((t) => t.family === e)) {
			let e = t.id.startsWith("operation:") ? t.id.split(":")[1] : "", n = e ? "operation:" + e : t.id, i = r.get(n), a = [
				t.label,
				t.id,
				t.purpose ?? "",
				t.shortcode ?? "",
				...t.searchAliases ?? []
			];
			i ? (i.aliases.push(...a), t.id === n && (i.choice = t)) : r.set(n, {
				choice: t,
				aliases: a
			});
		}
		return [...r.values()].map(({ choice: n, aliases: r }) => {
			let i = n.id.startsWith("operation:") ? n.id.split(":")[1] : "", a = Hf(i), o = i ? n.label.split(" · ")[0] : n.label, s = n.id.startsWith("boundary:");
			return {
				...n,
				title: o,
				compatible: !n.disabledReason && !!t.choose,
				shortcode: i ? a.shortcode || n.shortcode || "" : n.shortcode ?? a.shortcode,
				group: e === "Subgraphs" ? s ? "Interface" : "Library" : void 0,
				icon: e === "Subgraphs" ? s ? Hf("subgraph-" + n.id.split(":")[1]).icon : Rf.Library.icon : a.icon,
				searchAliases: r
			};
		});
	}
	function A(e = !1) {
		L(m, null), e && g?.focus({ preventScroll: !0 });
	}
	function j(e = !1) {
		C(), p++, L(o, ""), L(s, !1), A(), e && f?.focus({ preventScroll: !0 });
	}
	let M;
	Cn(() => {
		let e = JSON.stringify([t.insertionContextKey, t.view?.graphId]), n = r(), i = JSON.stringify(_.flatMap((e) => k(e).map((e) => [
			e.id,
			e.title,
			e.compatible,
			e.phase,
			e.family,
			e.shortcode,
			e.icon,
			e.group,
			e.purpose,
			e.searchAliases,
			e.disabledReason,
			e.definitionRef?.id,
			e.definitionRef?.version,
			e.definitionRef?.semanticHash
		])));
		M && (e !== M.scope || i !== M.catalog || n !== M.locked) && j(), M = {
			scope: e,
			catalog: i,
			locked: n
		};
	}), Ii(() => j());
	function ee() {
		let e = i.closest(".pc-canvas-area"), t = e.getBoundingClientRect();
		return {
			left: t.left + e.clientLeft,
			top: t.top + e.clientTop,
			right: t.right - e.clientLeft,
			width: e.clientWidth,
			height: e.clientHeight
		};
	}
	function te(e, t, n, r) {
		let i = ee(), a = i.right - e.right - 6, o = e.left - i.left - 6, s = a >= t || o >= t, c = a >= t ? e.right - i.left + 3 : o >= t ? e.left - i.left - t - 3 : 13;
		return {
			x: Math.max(4, Math.min(c, i.width - t - 4)),
			y: Math.max(4, Math.min(e.top - i.top, i.height - n - 4)),
			compact: !s || i.width < t + r + 26
		};
	}
	function ne(e, t, n) {
		let r = t.querySelector("button")?.getBoundingClientRect();
		return r ? e.top + (e.height - r.height) / 2 - (r.top - n.top) : e.top;
	}
	async function re(e, t, n = !0) {
		if (y) return;
		if (A(), H(o) === e) {
			n && H(a)?.querySelector("button:not(:disabled)")?.focus({ preventScroll: !0 });
			return;
		}
		let r = ++p;
		if (L(o, e, !0), L(s, !1), f = t, await mr(), r !== p || H(o) !== e || !H(a)?.isConnected) return;
		let i = t.getBoundingClientRect(), c = H(a).getBoundingClientRect(), m = te({
			top: ne(i, H(a), c),
			left: i.left,
			right: i.right
		}, c.width, c.height, i.width);
		L(u, m.x, !0), L(d, m.y, !0), L(l, m.compact, !0), n && H(a).querySelector("button:not(:disabled)")?.focus({ preventScroll: !0 });
	}
	async function ie() {
		let e = ++p;
		if (L(o, ""), L(s, !0), L(c, ""), await mr(), e !== p || !H(s) || !H(a)?.isConnected) return;
		let t = ee(), n = i.getBoundingClientRect(), r = H(a).getBoundingClientRect();
		L(u, Math.max(4, Math.min(n.right - t.left + 3, t.width - r.width - 4)), !0), L(d, n.top - t.top), H(a).querySelector("input")?.focus();
	}
	function ae(e, n) {
		let i = k(e.family).find((t) => t.id === e.id);
		i?.compatible && !r() && (j(!0), n ? t.choose?.(i.id, n) : t.choose?.(i.id));
	}
	async function oe(e, n) {
		let r = k("Subgraphs").find((t) => t.id === e.dataset.shelfChoice);
		if (!r?.definitionRef || !t.shelfSubgraph) return;
		let i = ee(), a = e.getBoundingClientRect();
		if (g = e, L(m, {
			id: r.id,
			title: r.title,
			x: (n?.x ?? a.right) - i.left,
			y: (n?.y ?? a.top) - i.top
		}, !0), await mr(), !H(m) || H(m).id !== r.id || !H(h)?.isConnected) return;
		let o = H(h).getBoundingClientRect();
		L(m, {
			...H(m),
			x: Math.max(4, Math.min(H(m).x, i.width - o.width - 4)),
			y: Math.max(4, Math.min(H(m).y, i.height - o.height - 4))
		}, !0), H(h).querySelector("button")?.focus({ preventScroll: !0 });
	}
	function se(e) {
		let n = e.target.closest("[data-shelf-choice]");
		n && k("Subgraphs").some((e) => e.id === n.dataset.shelfChoice && e.definitionRef) && t.shelfSubgraph && (e.preventDefault(), e.stopPropagation(), oe(n, {
			x: e.clientX,
			y: e.clientY
		}));
	}
	function ce(e) {
		let n = k("Subgraphs").find((e) => e.id === H(m)?.id);
		j(!0), n?.definitionRef && t.shelfSubgraph?.(n.id, e);
	}
	function le(e) {
		if ((e.key === "ContextMenu" || e.key === "F10" && e.shiftKey) && e.target.dataset.shelfChoice) {
			e.preventDefault(), e.stopPropagation(), oe(e.target);
			return;
		}
		if (H(m) && e.key === "Escape") {
			e.preventDefault(), e.stopPropagation(), A(!0);
			return;
		}
		if (e.key === "Escape") {
			e.preventDefault(), e.stopPropagation(), j(!0);
			return;
		}
		let t = e.target;
		if (e.key === "ArrowRight" && t.dataset.family && !t.disabled) {
			e.preventDefault(), e.stopPropagation(), re(t.dataset.family, t);
			return;
		}
		if (e.key === "ArrowLeft" && H(o)) {
			e.preventDefault(), e.stopPropagation(), j(!0);
			return;
		}
		if (e.key === "Tab") {
			j();
			return;
		}
		if (![
			"ArrowDown",
			"ArrowUp",
			"Home",
			"End"
		].includes(e.key) || e.target.tagName === "INPUT") return;
		e.preventDefault();
		let n = [...(e.target.closest("[role=\"menu\"]") || i).querySelectorAll("button:not(:disabled)")], r = n.indexOf(e.target);
		n[e.key === "Home" ? 0 : e.key === "End" ? n.length - 1 : (r + (e.key === "ArrowUp" ? n.length - 1 : 1)) % n.length]?.focus();
	}
	var ue = { openSearch: ie }, de = $f();
	U("pointerdown", an, (e) => {
		e.target.closest(".pc-node-shelf, .pc-shelf-menu") || j();
	}), U("pointermove", an, E), U("pointerup", an, D), U("pointercancel", an, () => C()), U("blur", an, () => j()), U("resize", an, () => j()), U("keydown", an, (e) => {
		y && e.key === "Escape" && (e.preventDefault(), e.stopPropagation(), j(!0));
	});
	var fe = z(de);
	Y(fe, 21, () => If, qr, (e, t) => {
		var n = Uf();
		let r;
		var i = R(n), a = R(i);
		P(i);
		var s = B(i), c = R(s, !0);
		P(s), P(n), V((e) => {
			Z(n, "data-family", H(t).name), n.disabled = e, Z(n, "title", "Browse " + H(t).name + " nodes"), Z(n, "aria-expanded", H(o) === H(t).name), r = hi(n, "", r, { "--pc-family": H(t).color }), Z(a, "d", H(t).icon), q(c, H(t).name);
		}, [() => !k(H(t).name).length]), W("click", n, (e) => re(H(t).name, e.currentTarget)), U("pointerenter", n, (e) => {
			e.pointerType !== "touch" && !e.currentTarget.disabled && re(H(t).name, e.currentTarget, !1);
		}), W("keydown", n, le), K(e, n);
	}), P(fe), Ni(fe, (e) => i = e, () => i);
	var pe = B(fe, 2), me = (e) => {
		let n = /* @__PURE__ */ F(() => H(s) ? _.flatMap((e) => k(e)).filter((e) => [
			e.title,
			e.id,
			e.family,
			e.purpose,
			e.shortcode,
			...e.searchAliases ?? []
		].join(" ").toLowerCase().includes(H(c).toLowerCase())) : k());
		var i = Xf();
		let f;
		var p = R(i), m = (e) => {
			var t = Wf();
			W("click", t, () => j(!0)), K(e, t);
		};
		J(p, (e) => {
			H(l) && H(o) && e(m);
		});
		var h = B(p, 2), g = (e) => {
			var t = Gf();
			X(t), ki(t, () => H(c), (e) => L(c, e)), K(e, t);
		};
		J(h, (e) => {
			H(s) && e(g);
		}), Y(B(h, 2), 19, () => H(n), (e) => e.family + e.id, (e, i, a) => {
			let o = /* @__PURE__ */ F(() => !H(i).compatible || r()), c = /* @__PURE__ */ F(() => !!H(i).definitionRef && !!t.shelfSubgraph), l = /* @__PURE__ */ F(() => r() ? H(c) ? "This graph is read-only. Right-click for subgraph actions." : "This graph is read-only." : H(i).disabledReason || (H(i).compatible ? "" : "Choose a graph in the " + H(i).phase + " stage to add this node."));
			var u = Jf(), d = z(u), f = (e) => {
				var t = Kf(), n = R(t, !0);
				P(t), V(() => {
					Z(t, "data-shelf-group", H(i).group), q(n, H(i).group);
				}), K(e, t);
			};
			J(d, (e) => {
				!H(s) && H(i).group && H(n)[H(a) - 1]?.group !== H(i).group && e(f);
			});
			var p = B(d, 2);
			let m;
			var h = R(p), g = R(h);
			P(h);
			var _ = B(h), y = R(_, !0), b = B(y), x = (e) => {
				var t = qf(), n = R(t, !0);
				P(t), V(() => q(n, H(l))), K(e, t);
			};
			J(b, (e) => {
				H(l) && e(x);
			}), P(_);
			var S = B(_), w = R(S, !0);
			P(S), P(p), V((e) => {
				Z(p, "data-shelf-choice", H(i).id), Z(p, "data-insertion-disabled", H(o)), p.disabled = H(o) && !H(c), Z(p, "aria-disabled", H(o) && !H(c)), Z(p, "aria-haspopup", H(c) ? "menu" : void 0), Z(p, "title", H(l) || H(i).purpose || "Add " + H(i).title), m = hi(p, "", m, e), Z(g, "d", H(i).icon), q(y, H(i).title), q(w, H(i).shortcode);
			}, [() => ({ "--pc-family": v(H(i).family) })]), W("pointerdown", p, (e) => T(e, H(i))), U("lostpointercapture", p, () => C()), W("click", p, (e) => O(e, H(i))), K(e, u);
		}, (e) => {
			var t = Yf(), n = R(t, !0);
			P(t), V(() => q(n, H(s) ? "No nodes match your search. Try another name or clear the search." : "No nodes are available in this family for the current graph.")), K(e, t);
		}), P(i), Ni(i, (e) => L(a, e), () => H(a)), V((e) => {
			pi(i, 1, `pc-shelf-menu ${H(s) ? "pc-leaf-menu" : "pc-family-menu"}`, "svelte-hk6fzp"), Z(i, "aria-label", H(s) ? "Search nodes" : H(o) + " nodes"), f = hi(i, "", f, e);
		}, [() => ({
			left: `${H(u)}px`,
			top: `${H(d)}px`,
			"--pc-family": v(H(o))
		})]), W("keydown", i, le), W("contextmenu", i, se), K(e, i);
	};
	J(pe, (e) => {
		(H(o) || H(s)) && e(me);
	});
	var he = B(pe, 2), ge = (e) => {
		var t = Zf();
		let n;
		var r = R(t), i = B(r, 2);
		P(t), Ni(t, (e) => L(h, e), () => H(h)), V(() => {
			Z(t, "aria-label", H(m).title + " actions"), n = hi(t, "", n, {
				left: `${H(m).x}px`,
				top: `${H(m).y}px`
			});
		}), W("keydown", t, le), W("click", r, () => ce("open")), W("click", i, () => ce("delete")), K(e, t);
	};
	J(he, (e) => {
		H(m) && e(ge);
	});
	var _e = B(he, 2), ve = (e) => {
		var t = Qf();
		let n;
		var r = R(t, !0);
		P(t), V((e) => {
			n = hi(t, "", n, e), q(r, H(S).title);
		}, [() => ({
			"--pc-family": v(H(S).family),
			left: `${H(S).x + 12}px`,
			top: `${H(S).y + 12}px`
		})]), K(e, t);
	};
	return J(_e, (e) => {
		H(S) && e(ve);
	}), V(() => pi(fe, 1, `pc-node-shelf${H(l) && H(o) ? " pc-shelf-replaced" : ""}`, "svelte-hk6fzp")), K(e, de), We(ue);
}
Er([
	"click",
	"keydown",
	"contextmenu",
	"pointerdown"
]);
//#endregion
//#region ui/ExamplesBrowser.svelte
var tp = /* @__PURE__ */ G("<button type=\"button\" class=\"pc-btn menu_button svelte-18p7ib8\">Reload examples</button>"), np = /* @__PURE__ */ G("<div class=\"pc-examples-issue svelte-18p7ib8\"><!><!></div>"), rp = /* @__PURE__ */ G("<option> </option>"), ip = /* @__PURE__ */ G("<li class=\"svelte-18p7ib8\"> </li>"), ap = /* @__PURE__ */ G("<li data-checkpoint=\"\" class=\"svelte-18p7ib8\"><strong> </strong><span class=\"svelte-18p7ib8\"> </span></li>"), op = /* @__PURE__ */ G("<li class=\"svelte-18p7ib8\"><strong> </strong><span class=\"svelte-18p7ib8\"> </span></li>"), sp = /* @__PURE__ */ G("<p class=\"pc-example-focus svelte-18p7ib8\"><strong> </strong> </p> <h4 class=\"svelte-18p7ib8\">Learn</h4><ul class=\"svelte-18p7ib8\"></ul> <h4 class=\"svelte-18p7ib8\">Setup</h4><ul class=\"svelte-18p7ib8\"></ul> <h4 class=\"svelte-18p7ib8\">Try the lesson</h4><ol class=\"svelte-18p7ib8\"></ol> <h4 class=\"svelte-18p7ib8\">Checkpoints</h4><ul class=\"svelte-18p7ib8\"></ul> <h4 class=\"svelte-18p7ib8\">Experiments</h4><ul class=\"svelte-18p7ib8\"></ul> <h4 class=\"svelte-18p7ib8\">Expected cases</h4><ul class=\"svelte-18p7ib8\"></ul> <p class=\"svelte-18p7ib8\"><strong>Auxiliary call budget:</strong> </p>", 1), cp = /* @__PURE__ */ G("<div><!></div>"), lp = /* @__PURE__ */ G("<section class=\"pc-example-details svelte-18p7ib8\"><header class=\"svelte-18p7ib8\"><h3 tabindex=\"-1\" class=\"svelte-18p7ib8\"> </h3><button type=\"button\" class=\"pc-btn menu_button\" aria-label=\"Close lesson details\">Close</button></header> <p class=\"svelte-18p7ib8\"> </p> <!> <!> <button type=\"button\" class=\"pc-btn menu_button\">Open independent copy</button></section>"), up = /* @__PURE__ */ G("<p class=\"pc-examples-empty svelte-18p7ib8\"> </p>"), dp = /* @__PURE__ */ Fr("<g class=\"pc-example-group svelte-18p7ib8\"><rect rx=\"6\" class=\"svelte-18p7ib8\"></rect><text class=\"svelte-18p7ib8\"> </text></g>"), fp = /* @__PURE__ */ Fr("<g class=\"pc-example-comment svelte-18p7ib8\"><rect rx=\"4\" class=\"svelte-18p7ib8\"></rect><text class=\"svelte-18p7ib8\"> </text></g>"), pp = /* @__PURE__ */ Fr("<path class=\"pc-wire pc-wire-native\"></path>"), mp = /* @__PURE__ */ Fr("<!><text class=\"pc-example-pin-label svelte-18p7ib8\"> </text>", 1), hp = /* @__PURE__ */ Fr("<g><rect class=\"pc-example-card svelte-18p7ib8\" rx=\"4\"></rect><svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\"><path class=\"pc-example-icon svelte-18p7ib8\"></path></svg><text class=\"pc-example-node-title svelte-18p7ib8\" lengthAdjust=\"spacingAndGlyphs\"> </text><!></g>"), gp = /* @__PURE__ */ Fr("<svg class=\"pc-example-preview svelte-18p7ib8\" preserveAspectRatio=\"xMidYMid meet\" aria-hidden=\"true\" focusable=\"false\"><!><!><!><!></svg>"), _p = /* @__PURE__ */ G("<span class=\"pc-example-unavailable-preview svelte-18p7ib8\"><strong class=\"svelte-18p7ib8\">Unavailable</strong><span class=\"svelte-18p7ib8\">Open Lesson details for this example.</span></span>"), vp = /* @__PURE__ */ G("<span class=\"pc-example-band svelte-18p7ib8\"> </span>"), yp = /* @__PURE__ */ G("<article class=\"pc-example-entry svelte-18p7ib8\"><button type=\"button\"><!> <span class=\"pc-example-title svelte-18p7ib8\"> </span> <!> <span class=\"pc-example-goal svelte-18p7ib8\"> </span></button> <!> <button type=\"button\" class=\"pc-example-details-button svelte-18p7ib8\">Lesson details</button></article>"), bp = /* @__PURE__ */ G("<!> <div class=\"pc-examples-filters svelte-18p7ib8\"><label class=\"svelte-18p7ib8\">Search lessons<input aria-label=\"Search lessons\" type=\"search\" placeholder=\"Goal, node or technique\" class=\"svelte-18p7ib8\"/></label> <label class=\"svelte-18p7ib8\">Difficulty<select aria-label=\"Difficulty\" class=\"svelte-18p7ib8\"><option>All difficulties</option><!></select></label> <span class=\"pc-examples-count svelte-18p7ib8\" role=\"status\"> </span></div> <div class=\"pc-examples-grid svelte-18p7ib8\"><!> <!> <!></div>", 1);
function xp(e, t) {
	Ue(t, !0);
	let n = Pi(t, "examples", 19, () => []), r = Pi(t, "issue", 3, ""), i = Pi(t, "scrollTop", 3, 0), a, o = /* @__PURE__ */ I(void 0), s = /* @__PURE__ */ I(void 0), c = /* @__PURE__ */ I(""), l = /* @__PURE__ */ I(""), u = /* @__PURE__ */ I(""), d = /* @__PURE__ */ I(""), f = [
		"Foundations",
		"Composition",
		"Advanced",
		"Capstone"
	], p = /* @__PURE__ */ F(() => n().filter((e) => {
		if (H(u) && e.lesson?.difficulty !== H(u)) return !1;
		let t = H(l).toLocaleLowerCase().trim().split(/\s+/).filter(Boolean), n = [
			e.number,
			e.title,
			e.goal,
			JSON.stringify(e.lesson ?? {}),
			...e.thumbnail?.nodes.map((e) => e.title) ?? []
		].join(" ").toLocaleLowerCase();
		return t.every((e) => n.includes(e));
	})), m = /* @__PURE__ */ F(() => n().find((e) => e.id === H(d)));
	Fi(() => {
		a.scrollTop = i();
	});
	async function h(e) {
		L(d, H(d) === e ? "" : e, !0), H(d) && (await mr(), a.scrollTop = 0, H(o)?.focus());
	}
	async function g(e) {
		L(d, ""), await mr(), (Array.from(a.querySelectorAll(".pc-example-details-button")).find((t) => t.dataset.exampleId === e) ?? H(s))?.focus();
	}
	async function _(e) {
		if (!H(c)) {
			L(c, e, !0);
			try {
				await t.open(e);
			} finally {
				L(c, "");
			}
		}
	}
	var v = bp(), y = z(v), b = (e) => {
		var n = np(), i = R(n);
		go(i, { get issue() {
			return r();
		} });
		var a = B(i), o = (e) => {
			var n = tp();
			W("click", n, () => t.retry?.()), K(e, n);
		};
		J(a, (e) => {
			t.retry && e(o);
		}), P(n), K(e, n);
	};
	J(y, (e) => {
		r() && e(b);
	});
	var x = B(y, 2), S = R(x), C = B(R(S));
	X(C), Ni(C, (e) => L(s, e), () => H(s)), P(S);
	var w = B(S, 2), T = B(R(w)), E = R(T);
	E.value = E.__value = "", Y(B(E), 17, () => f, qr, (e, t) => {
		var n = rp(), r = R(n, !0);
		P(n);
		var i = {};
		V(() => {
			q(r, H(t)), i !== (i = H(t)) && (n.value = (n.__value = H(t)) ?? "");
		}), K(e, n);
	}), P(T), P(w);
	var D = B(w, 2), O = R(D);
	P(D), P(x);
	var k = B(x, 2), A = R(k), j = (e) => {
		var t = lp(), n = R(t), r = R(n), i = R(r);
		P(r), Ni(r, (e) => L(o, e), () => H(o));
		var a = B(r);
		P(n);
		var s = B(n, 2), l = R(s, !0);
		P(s);
		var u = B(s, 2), d = (e) => {
			var t = sp(), n = z(t), r = R(n), i = R(r, !0);
			P(r);
			var a = B(r);
			P(n);
			var o = B(n, 3);
			Y(o, 21, () => H(m).lesson.learn, qr, (e, t) => {
				var n = ip(), r = R(n, !0);
				P(n), V(() => q(r, H(t))), K(e, n);
			}), P(o);
			var s = B(o, 3);
			Y(s, 21, () => H(m).lesson.requirements, qr, (e, t) => {
				var n = ip(), r = R(n, !0);
				P(n), V(() => q(r, H(t))), K(e, n);
			}), P(s);
			var c = B(s, 3);
			Y(c, 21, () => H(m).lesson.steps, qr, (e, t) => {
				var n = ip(), r = R(n, !0);
				P(n), V(() => q(r, H(t))), K(e, n);
			}), P(c);
			var l = B(c, 3);
			Y(l, 21, () => H(m).lesson.checkpoints, qr, (e, t) => {
				var n = ap(), r = R(n), i = R(r);
				P(r);
				var a = B(r), o = R(a, !0);
				P(a), P(n), V(() => {
					q(i, `${H(t).node ?? ""} → ${H(t).port ?? ""}`), q(o, H(t).expect);
				}), K(e, n);
			}), P(l);
			var u = B(l, 3);
			Y(u, 21, () => H(m).lesson.experiments, qr, (e, t) => {
				var n = op(), r = R(n), i = R(r, !0);
				P(r);
				var a = B(r), o = R(a, !0);
				P(a), P(n), V(() => {
					q(i, H(t).change), q(o, H(t).expect);
				}), K(e, n);
			}), P(u);
			var d = B(u, 3);
			Y(d, 21, () => H(m).lesson.cases, qr, (e, t) => {
				var n = op(), r = R(n), i = R(r, !0);
				P(r);
				var a = B(r), o = R(a, !0);
				P(a), P(n), V(() => {
					q(i, H(t).when), q(o, H(t).expect);
				}), K(e, n);
			}), P(d);
			var f = B(d, 2), p = B(R(f));
			P(f), V(() => {
				q(i, H(m).lesson.difficulty), q(a, ` · ${H(m).lesson.focus ?? ""}`), q(p, ` ${H(m).lesson.callBudget ?? ""}`);
			}), K(e, t);
		};
		J(u, (e) => {
			H(m).lesson && e(d);
		});
		var f = B(u, 2), p = (e) => {
			var t = cp();
			go(R(t), { get issue() {
				return H(m).issue;
			} }), P(t), V(() => Z(t, "id", `pc-example-issue-${H(m).number}`)), K(e, t);
		};
		J(f, (e) => {
			H(m).issue && e(p);
		});
		var h = B(f, 2);
		P(t), V(() => {
			Z(t, "aria-label", `Lesson ${H(m).number} details`), q(i, `${H(m).number ?? ""}. ${H(m).title ?? ""}`), q(l, H(m).goal), h.disabled = !!H(c) || !H(m).thumbnail;
		}), W("click", a, () => g(H(m).id)), W("click", h, () => _(H(m).id)), K(e, t);
	};
	J(A, (e) => {
		H(m) && e(j);
	});
	var M = B(A, 2), ee = (e) => {
		var t = up(), n = R(t, !0);
		P(t), V((e) => q(n, e), [() => H(l).trim() || H(u) ? "No lessons match your search and difficulty. Clear a filter to see more lessons." : "No lessons are available yet. Reload examples to check again."]), K(e, t);
	};
	J(M, (e) => {
		!H(p).length && !r() && e(ee);
	}), Y(B(M, 2), 17, () => H(p), (e) => e.id, (e, t) => {
		let n = /* @__PURE__ */ F(() => H(t).thumbnail);
		var r = yp(), i = R(r);
		let a;
		var o = R(i), s = (e) => {
			var t = gp(), r = R(t);
			Y(r, 17, () => H(n).groups, (e) => e.id, (e, t) => {
				var n = dp(), r = R(n), i = B(r), a = R(i, !0);
				P(i), P(n), V(() => {
					Z(n, "data-id", H(t).id), Z(r, "x", H(t).x), Z(r, "y", H(t).y), Z(r, "width", H(t).w), Z(r, "height", H(t).h), Z(i, "x", H(t).x + 12), Z(i, "y", H(t).y + 24), q(a, H(t).title);
				}), K(e, n);
			});
			var i = B(r);
			Y(i, 17, () => H(n).comments, (e) => e.id, (e, t) => {
				var n = fp(), r = R(n);
				let i;
				var a = B(r), o = R(a, !0);
				P(a), P(n), V(() => {
					Z(n, "data-id", H(t).id), Z(r, "x", H(t).x), Z(r, "y", H(t).y), Z(r, "width", H(t).w), Z(r, "height", H(t).h), i = hi(r, "", i, { stroke: H(t).color }), Z(a, "x", H(t).x + 12), Z(a, "y", H(t).y + 24), q(o, H(t).title);
				}), K(e, n);
			});
			var a = B(i);
			Y(a, 17, () => H(n).wires, (e) => e.id, (e, t) => {
				var n = pp();
				V(() => {
					Z(n, "data-kind", H(t).kind), Z(n, "data-id", H(t).id), Z(n, "d", H(t).d);
				}), K(e, n);
			}), Y(B(a), 17, () => H(n).nodes, (e) => e.id, (e, t) => {
				var n = hp(), r = R(n), i = B(r), a = R(i);
				P(i);
				var o = B(i), s = R(o, !0);
				P(o), Y(B(o), 17, () => H(t).ports, (e) => e.id, (e, t) => {
					var n = mp(), r = z(n);
					{
						let e = /* @__PURE__ */ F(() => H(t).x - 9), n = /* @__PURE__ */ F(() => H(t).y - 9);
						Wi(r, {
							get kind() {
								return H(t).kind;
							},
							className: "pc-example-pin-cue",
							get x() {
								return H(e);
							},
							get y() {
								return H(n);
							}
						});
					}
					var i = B(r), a = R(i, !0);
					P(i), V(() => {
						Z(i, "x", H(t).x + (H(t).dir === "in" ? 9 : -9)), Z(i, "y", H(t).y + 4), Z(i, "text-anchor", H(t).dir === "in" ? "start" : "end"), q(a, H(t).label);
					}), K(e, n);
				}), P(n), V(() => {
					pi(n, 0, si(H(t).className), "svelte-18p7ib8"), Z(n, "data-id", H(t).id), Z(r, "x", H(t).x), Z(r, "y", H(t).y), Z(r, "width", H(t).w), Z(r, "height", H(t).h), Z(i, "x", H(t).x + 8), Z(i, "y", H(t).y + 7), Z(a, "d", H(t).iconPath), Z(o, "x", H(t).x + 28), Z(o, "y", H(t).y + 20), Z(o, "textLength", H(t).title.length * 6 > H(t).w - 36 ? H(t).w - 36 : void 0), q(s, H(t).title);
				}), K(e, n);
			}), P(t), V(() => Z(t, "viewBox", `${H(n).bounds.x} ${H(n).bounds.y} ${H(n).bounds.w} ${H(n).bounds.h}`)), K(e, t);
		}, l = (e) => {
			K(e, _p());
		};
		J(o, (e) => {
			H(n) ? e(s) : e(l, -1);
		});
		var u = B(o, 2), f = R(u);
		P(u);
		var p = B(u, 2), m = (e) => {
			var n = vp(), r = R(n);
			P(n), V(() => q(r, `${H(t).lesson.difficulty ?? ""} · ${H(t).lesson.focus ?? ""}`)), K(e, n);
		};
		J(p, (e) => {
			H(t).lesson && e(m);
		});
		var g = B(p, 2), v = R(g, !0);
		P(g), P(i);
		var y = B(i, 2), b = (e) => {
			var n = cp();
			go(R(n), { get issue() {
				return H(t).issue;
			} }), P(n), V(() => Z(n, "id", `pc-example-issue-${H(t).number}`)), K(e, n);
		};
		J(y, (e) => {
			H(t).issue && H(d) !== H(t).id && e(b);
		});
		var x = B(y, 2);
		P(r), V(() => {
			a = pi(i, 1, "pc-example-tile svelte-18p7ib8", null, a, { "pc-example-unavailable": !H(n) }), Z(i, "aria-label", H(t).title), Z(i, "aria-describedby", H(t).issue ? `pc-example-issue-${H(t).number}` : void 0), Z(i, "title", H(t).goal), i.disabled = !!H(c) || !H(n), q(f, `${H(t).number ?? ""}. ${H(t).title ?? ""}`), q(v, H(t).goal), Z(x, "data-example-id", H(t).id), Z(x, "aria-label", `Details for ${H(t).title}`), Z(x, "aria-expanded", H(d) === H(t).id);
		}), W("click", i, () => _(H(t).id)), W("click", x, () => h(H(t).id)), K(e, r);
	}), P(k), Ni(k, (e) => a = e, () => a), V(() => {
		q(O, `${H(p).length ?? ""} of ${n().length ?? ""} lessons`), Z(k, "aria-busy", !!H(c));
	}), ki(C, () => H(l), (e) => L(l, e)), vi(T, () => H(u), (e) => L(u, e)), U("scroll", k, (e) => t.scroll(e.currentTarget.scrollTop)), K(e, v), We();
}
Er(["click"]);
//#endregion
//#region ui/ImportReview.svelte
var Sp = /* @__PURE__ */ G("<p> </p>"), Cp = /* @__PURE__ */ G("<li> </li>"), wp = /* @__PURE__ */ G("<h3>Saved bindings to review</h3><ul></ul>", 1), Tp = /* @__PURE__ */ G("<p>Saved model metadata is present. Review local connections before running.</p>"), Ep = /* @__PURE__ */ G("<h3>Imported terminal effects</h3><ul></ul>", 1), Dp = /* @__PURE__ */ G("<p>No imported terminal effects.</p>"), Op = /* @__PURE__ */ G("<div><!></div>"), kp = /* @__PURE__ */ G("<button type=\"button\" class=\"pc-btn menu_button\">Prepare again</button>"), Ap = /* @__PURE__ */ G("<div class=\"pc-workspace-overlay pc-import-overlay\"><div class=\"pc-workspace-dialog pc-import-review\" role=\"dialog\" aria-modal=\"true\" aria-label=\"Import into graph\" tabindex=\"-1\"><header><h2>Import into graph</h2><button type=\"button\" class=\"pc-btn menu_button\" aria-label=\"Cancel import\">×</button></header> <p><strong> </strong> <small> </small></p> <dl><dt>Phase</dt><dd> </dd><dt>Additions</dt><dd> </dd><dt>Conservative request bound</dt><dd> </dd></dl> <p class=\"pc-import-explanation\">This authoring bound includes unfinished branches. Bindings and reachable execution are checked when you explicitly run the workflow.</p> <!> <!> <!> <p>Insertion keeps internal wiring and relative layout. Review the inserted nodes before running the workflow.</p> <!> <footer><button type=\"button\" class=\"pc-btn menu_button\">Cancel</button><!><button type=\"button\" class=\"pc-btn menu_button pc-import-accept\">Insert into graph</button></footer></div></div>");
function jp(e, t) {
	let n = Rr();
	Ue(t, !0);
	let r;
	Fi(() => {
		let e = document.activeElement;
		return r.querySelector("button")?.focus(), () => e?.focus({ preventScroll: !0 });
	});
	function i(e) {
		if (e.stopPropagation(), e.key === "Escape" && (e.preventDefault(), t.actions.cancelImport?.()), e.key === "Tab") {
			let t = [...r.querySelectorAll("button:not(:disabled)")], n = t[0], i = t.at(-1);
			e.shiftKey && document.activeElement === n && (e.preventDefault(), i?.focus()), !e.shiftKey && document.activeElement === i && (e.preventDefault(), n?.focus());
		}
	}
	var a = Ap(), o = R(a), s = R(o), c = B(R(s));
	P(s);
	var l = B(s, 2), u = R(l), d = R(u, !0);
	P(u);
	var f = B(u, 2), p = R(f, !0);
	P(f), P(l);
	var m = B(l, 2), h = B(R(m)), g = R(h, !0);
	P(h);
	var _ = B(h, 2), v = R(_);
	P(_);
	var y = B(_, 2), b = R(y);
	P(y), P(m);
	var x = B(m, 4), S = (e) => {
		var n = Sp(), r = R(n);
		P(n), V((e) => q(r, `Imported model roles: ${e ?? ""}.`), [() => t.view.requiredRoles.join(", ")]), K(e, n);
	};
	J(x, (e) => {
		t.view.requiredRoles.length && e(S);
	});
	var C = B(x, 2), w = (e) => {
		var n = wp(), r = B(z(n));
		Y(r, 21, () => t.view.unresolvedBindings, qr, (e, t) => {
			var n = Cp(), r = R(n);
			P(n), V((e) => q(r, `${H(t).title ?? ""} · ${H(t).role ?? ""}: missing ${e ?? ""}`), [() => H(t).missing.join(" and ")]), K(e, n);
		}), P(r), K(e, n);
	}, T = (e) => {
		K(e, Tp());
	};
	J(C, (e) => {
		t.view.unresolvedBindings.length ? e(w) : t.view.bindingReviewRequired && e(T, 1);
	});
	var E = B(C, 2), D = (e) => {
		var n = Ep(), r = B(z(n));
		Y(r, 21, () => t.view.terminals, qr, (e, t) => {
			var n = Cp(), r = R(n);
			P(n), V(() => q(r, `${H(t).title ?? ""} · ${H(t).operation ?? ""}`)), K(e, n);
		}), P(r), K(e, n);
	}, O = (e) => {
		K(e, Dp());
	};
	J(E, (e) => {
		t.view.terminals.length ? e(D) : e(O, -1);
	});
	var k = B(E, 4), A = (e) => {
		var r = Op();
		go(R(r), { get issue() {
			return t.view.error;
		} }), P(r), V(() => Z(r, "id", n + "-error")), K(e, r);
	};
	J(k, (e) => {
		t.view.error && e(A);
	});
	var j = B(k, 2), M = R(j), ee = B(M), te = (e) => {
		var n = kp();
		W("click", n, () => t.actions.prepareImportAgain?.()), K(e, n);
	};
	J(ee, (e) => {
		t.view.error && e(te);
	});
	var ne = B(ee);
	P(j), P(o), Ni(o, (e) => r = e, () => r), P(a), V(() => {
		q(d, t.view.name), q(p, t.view.fileName), q(g, t.view.phase), q(v, `${t.view.nodeCount ?? ""} blocks · ${t.view.wireCount ?? ""} wires · ${t.view.groupCount ?? ""} groups`), q(b, `${t.view.callBound ?? ""} total · ${t.view.importedCallBound ?? ""} imported`), Z(ne, "aria-describedby", t.view.error ? n + "-error" : void 0), ne.disabled = !!t.view.error;
	}), W("keydown", o, i), U("paste", o, (e) => e.stopPropagation()), W("click", c, () => t.actions.cancelImport?.()), W("click", M, () => t.actions.cancelImport?.()), W("click", ne, () => t.actions.acceptImport?.()), K(e, a), We();
}
Er(["keydown", "click"]);
//#endregion
//#region ui/WorkspaceReport.svelte
var Mp = /* @__PURE__ */ G("<li class=\"svelte-1xdk4mm\"><!></li>"), Np = /* @__PURE__ */ G("<ul></ul>"), Pp = /* @__PURE__ */ G("<p role=\"status\" class=\"svelte-1xdk4mm\">No validation issues found.</p>"), Fp = /* @__PURE__ */ G("<p class=\"svelte-1xdk4mm\">Root workflow: <strong> </strong> </p> <!> <p class=\"svelte-1xdk4mm\">Validation checks the current workflow without running it. Diagnostic previews and Apply recheck their inputs when used.</p>", 1), Ip = /* @__PURE__ */ G("<p class=\"svelte-1xdk4mm\">Workflow validation is unavailable.</p>"), Lp = /* @__PURE__ */ G("<p class=\"svelte-1xdk4mm\"><strong> </strong></p> <p class=\"svelte-1xdk4mm\">Named-pin workflows, optional scene guidance and reviewed reply repairs for SillyTavern.</p> <p class=\"svelte-1xdk4mm\"><a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-1xdk4mm\">Project guide</a></p>", 1), Rp = /* @__PURE__ */ G("<p class=\"svelte-1xdk4mm\">Browse the node shelf by family. Select a node to read its controls, connections and help in Details.</p> <p class=\"svelte-1xdk4mm\"><a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-1xdk4mm\">Open the complete node reference</a></p>", 1), zp = /* @__PURE__ */ G("<table class=\"svelte-1xdk4mm\"><thead><tr><th class=\"svelte-1xdk4mm\">Action</th><th class=\"svelte-1xdk4mm\">Shortcut</th></tr></thead><tbody><tr><td class=\"svelte-1xdk4mm\">Undo / Redo</td><td class=\"svelte-1xdk4mm\">Ctrl Z / Ctrl Shift Z</td></tr><tr><td class=\"svelte-1xdk4mm\">Cut / Copy / Paste</td><td class=\"svelte-1xdk4mm\">Ctrl X / Ctrl C / Ctrl V</td></tr><tr><td class=\"svelte-1xdk4mm\">Duplicate / Delete selection</td><td class=\"svelte-1xdk4mm\">Ctrl D / Delete</td></tr><tr><td class=\"svelte-1xdk4mm\">Select all</td><td class=\"svelte-1xdk4mm\">Ctrl A</td></tr><tr><td class=\"svelte-1xdk4mm\">Group / Ungroup</td><td class=\"svelte-1xdk4mm\">Ctrl G / Ctrl Shift G</td></tr><tr><td class=\"svelte-1xdk4mm\">Comment selection / Add comment</td><td class=\"svelte-1xdk4mm\">C</td></tr><tr><td class=\"svelte-1xdk4mm\">Fit and center selection</td><td class=\"svelte-1xdk4mm\">F</td></tr><tr><td class=\"svelte-1xdk4mm\">Rename selection</td><td class=\"svelte-1xdk4mm\">F2</td></tr><tr><td class=\"svelte-1xdk4mm\">Run to selected node</td><td class=\"svelte-1xdk4mm\">R</td></tr><tr><td class=\"svelte-1xdk4mm\">Target selected node / Clear target</td><td class=\"svelte-1xdk4mm\">T</td></tr><tr><td class=\"svelte-1xdk4mm\">Pan / Zoom</td><td class=\"svelte-1xdk4mm\">Middle mouse / Wheel</td></tr><tr><td class=\"svelte-1xdk4mm\">Zoom out / Zoom in</td><td class=\"svelte-1xdk4mm\">[ / ] with a graph camera focused</td></tr><tr><td class=\"svelte-1xdk4mm\">Dismiss a menu or panel</td><td class=\"svelte-1xdk4mm\">Escape</td></tr></tbody></table> <p class=\"svelte-1xdk4mm\">In menus, use arrows to move, Home/End to jump, type a label to find it, and Enter/Space to choose it. Tab dismisses the menu.</p>", 1), Bp = /* @__PURE__ */ G("<p class=\"svelte-1xdk4mm\">Browse node families on the floating shelf. Middle mouse pans the graph; the wheel zooms around the pointer. Use the dividers or their arrow keys to resize Preview and Details. View controls panel visibility and restores the default layout.</p> <p class=\"svelte-1xdk4mm\">File opens workflow documents, saves the current file, imports a fragment into the current graph, and exports a portable copy without local connections. Graph tabs open child views of the current document.</p> <p class=\"svelte-1xdk4mm\">Enable Lattice while the unified document is open, then Send in SillyTavern. Choose model connections on the node bar and advanced overrides in Details. Workflow › Configure opens Workflow Data, and Memory recall offers queue actions and an overview.</p> <p class=\"svelte-1xdk4mm\">Graph groups nodes, creates and saves subgraphs, adds comments and manages portals. Right-click actions remain available beside the relevant node or pin.</p> <p class=\"svelte-1xdk4mm\">Preview follows selection until you pin an output or target a node with T. Targeting keeps that node's output visible while you select other nodes; T moves or clears the target. Workflow › Run to current output tests its dependencies within the displayed request bound. Apply and Reject stay beside the exact result they review.</p> <p class=\"svelte-1xdk4mm\"><a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-1xdk4mm\">Open the project guide</a> · <a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-1xdk4mm\">Node reference</a></p>", 1);
function Vp(e, t) {
	Ue(t, !0);
	let n = /* @__PURE__ */ F(() => t.workflow?.diagnostics ?? lo(t.workflow?.issues ?? []));
	var r = Lr(), i = z(r), a = (e) => {
		var r = Lr(), i = z(r), a = (e) => {
			var r = Fp(), i = z(r), a = B(R(i)), o = R(a, !0);
			P(a);
			var s = B(a);
			P(i);
			var c = B(i, 2), l = (e) => {
				var t = Np();
				Y(t, 21, () => H(n), (e) => e.id, (e, t) => {
					var n = Mp();
					go(R(n), { get diagnostic() {
						return H(t);
					} }), P(n), K(e, n);
				}), P(t), K(e, t);
			}, u = (e) => {
				K(e, Pp());
			};
			J(c, (e) => {
				H(n).length ? e(l) : e(u, -1);
			}), Me(2), V(() => {
				q(o, t.workflow.name), q(s, ` · ${t.workflow.phase ?? ""} · maximum ${t.workflow.callBound ?? ""} model requests.`);
			}), K(e, r);
		}, o = (e) => {
			K(e, Ip());
		};
		J(i, (e) => {
			t.workflow ? e(a) : e(o, -1);
		}), K(e, r);
	}, o = (e) => {
		var n = Lp(), r = z(n), i = R(r), a = R(i);
		P(i), P(r);
		var o = B(r, 4), s = R(o);
		P(o), V(() => {
			q(a, `Lattice ${t.version ?? ""}`), Z(s, "href", t.guideUrl);
		}), K(e, n);
	}, s = (e) => {
		var n = Rp(), r = B(z(n), 2), i = R(r);
		P(r), V(() => Z(i, "href", t.referenceUrl)), K(e, n);
	}, c = (e) => {
		var t = zp();
		Me(2), K(e, t);
	}, l = (e) => {
		var n = Bp(), r = B(z(n), 10), i = R(r), a = B(i, 2);
		P(r), V(() => {
			Z(i, "href", t.guideUrl), Z(a, "href", t.referenceUrl);
		}), K(e, n);
	};
	J(i, (e) => {
		t.panel === "validate-workflow" ? e(a) : t.panel === "about" ? e(o, 1) : t.panel === "node-reference" ? e(s, 2) : t.panel === "shortcuts" ? e(c, 3) : e(l, -1);
	}), K(e, r), We();
}
var Hp = {
	display_name: "Lattice",
	loading_order: 120,
	generate_interceptor: "latticeGenerationInterceptor",
	requires: [],
	optional: [],
	js: "index.js?v=0.27.0",
	css: "style.css",
	author: "Dulgadurbit",
	version: "0.27.0",
	homePage: "https://github.com/MentallyQuill/Lattice",
	auto_update: !1,
	description: "Build named-pin workflows for optional scene guidance and reviewed reply repairs in SillyTavern, with per-node model connections."
}, Up = /* @__PURE__ */ G("<div class=\"pc-native-diagnostic svelte-1dr9aew\"><!></div>"), Wp = /* @__PURE__ */ G("<p>Browse node families on the floating shelf. Middle mouse pans the graph; the wheel zooms around the pointer. Use the dividers or their arrow keys to resize Preview and Details. View controls panel visibility; View › Reset panel layout restores the default layout.</p><p>Open examples from File to start a workflow document. A unified workflow's preparation stage feeds Generate Reply, and its response stage reshapes the captured Draft before Review and Publish. Choose each model node's connection with the bar under it. Details contains advanced model overrides and inheritance settings. Enable Lattice runs the open document for Send in SillyTavern. Run to here tests supported nodes; Workflow › Stop workflow cancels the current run. Retired pre and post workflows remain available only for archived export.</p><p>File › New workflow, Open workflow, Open Recent and Open examples replace the open document after offering Save, Don't Save or Cancel for unsaved changes. Save writes the current file; Save As chooses a destination. Save As creates a JSON copy when direct file saving is unavailable. Export workflow JSON makes a portable sharing copy without local connections. Import into graph reviews a compatible fragment before one undoable insertion. Recover previous workflows opens unified documents preserved from earlier settings. File › Export archived workflows preserves retired originals for reference. Recovery drafts remain available in SillyTavern, while the filename and document status describe the current file.</p><p>Select nodes and right-click Create Subgraph to open their connected body in a new tab. Double-click a subgraph to open it. Add Input and Output nodes from the Subgraphs shelf inside an editable subgraph, then name and configure their ports in Details.</p><p>Right-click a subgraph block and choose Add to Subgraphs to save it for reuse. Right-click a saved shelf entry to delete it. Saving updates the shelf only when you choose to save; existing placed copies stay unchanged. Portals connect pins through named references. Preview artifact tabs show results for the selected node; Run to here checks the request bound before running. Apply reviews the fresh result against the full root workflow.</p><p><a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-1dr9aew\">Open the project guide</a> · <a target=\"_blank\" rel=\"noreferrer\" class=\"svelte-1dr9aew\">Node reference</a></p>", 1), Gp = /* @__PURE__ */ G("<div class=\"pc-workspace-overlay\"><div role=\"dialog\" tabindex=\"-1\" aria-modal=\"true\"><header class=\"svelte-1dr9aew\"><h2 class=\"svelte-1dr9aew\"> </h2><button type=\"button\" class=\"pc-btn menu_button\"> </button></header> <!></div></div>"), Kp = /* @__PURE__ */ G("<div class=\"pc-workspace-overlay\"><div class=\"pc-manager-dialog svelte-1dr9aew\" role=\"dialog\" tabindex=\"-1\" aria-modal=\"true\" aria-label=\"Manage portals\"><!></div></div>"), qp = /* @__PURE__ */ G("<div role=\"dialog\" aria-modal=\"true\" aria-label=\"Lattice\" data-pc-workbench=\"svelte\"><!> <div class=\"pc-body\" role=\"region\" aria-label=\"Workspace panels\" tabindex=\"0\"><div class=\"pc-stage\"><section aria-label=\"Output preview\"><header class=\"pc-preview-pane-head\"><strong>Preview</strong><button type=\"button\" class=\"pc-btn menu_button\"> </button></header> <div class=\"pc-preview-content\"><!></div></section> <!> <!> <!> <div class=\"pc-canvas-area\" id=\"pc-workspace-graph\" role=\"tabpanel\"><div class=\"pc-workspace-run svelte-1dr9aew\"><!></div> <div class=\"pc-canvas-host\" aria-label=\"Node canvas\"></div> <!> <div><!></div></div></div> <!> <div class=\"pc-inspector pc-workspace-details svelte-1dr9aew\"><header class=\"pc-details-heading svelte-1dr9aew\"><strong class=\"svelte-1dr9aew\">Details</strong><button type=\"button\" aria-label=\"Close Details\" title=\"Close Details\">×</button></header> <!> <div class=\"pc-node-details-holder svelte-1dr9aew\"><!></div></div></div> <!> <!> <!> <!> <!> <!> <!> <!> <!></div>");
function Jp(e, t) {
	Ue(t, !0);
	let n = Pi(t, "actions", 7), r = /* @__PURE__ */ I({
		graphId: "",
		enabled: !1,
		inspectorOpen: !0,
		history: {
			undo: !1,
			redo: !1,
			undoTitle: "Nothing to undo",
			redoTitle: "Nothing to redo",
			note: "",
			showNote: !1
		},
		camera: {
			x: 0,
			y: 0,
			zoom: 1,
			mode: "select"
		},
		selectionCount: 0
	}), i, a, o, s, c, l, u;
	function d() {
		return {
			root: i,
			parts: {
				...l.getParts(),
				inspector: c,
				canvasHost: o
			}
		};
	}
	function f(e) {
		n({
			...n(),
			...e
		});
	}
	function p(e) {
		L(r, {
			...H(r),
			...e
		});
	}
	function m(e) {
		return u?.startRename(e);
	}
	async function h(e, t) {
		if (await mr(), !t()) return;
		let n = [...o.querySelectorAll(".pc-comment-frame[data-id]")].find((t) => t.dataset.id === e)?.querySelector(".pc-comment-title-input");
		n && !n.disabled && (n.focus({ preventScroll: !0 }), n.select());
	}
	let g = "lattice.workspace.preview";
	function _() {
		try {
			let e = JSON.parse(localStorage.getItem(g) || "null");
			return {
				height: Number.isFinite(e?.height) ? Math.max(90, Math.min(600, e.height)) : 240,
				collapsed: e?.collapsed === !0,
				shelfOpen: e?.shelfOpen !== !1
			};
		} catch {
			return {
				height: 240,
				collapsed: !1,
				shelfOpen: !0
			};
		}
	}
	let v = _(), y = /* @__PURE__ */ I(tn(v.height)), b = /* @__PURE__ */ I(tn(v.collapsed)), x = /* @__PURE__ */ I(500), S = /* @__PURE__ */ I(tn(v.shelfOpen)), C = /* @__PURE__ */ I(null), w = /* @__PURE__ */ I(520), T = /* @__PURE__ */ F(() => Math.max(220, Math.min(H(w), H(C) ?? H(r).detailsWidth ?? 258)));
	function E(e) {
		L(C, null), L(r, {
			...H(r),
			detailsWidth: e
		}), n().resizeDetails?.(e);
	}
	let D = /* @__PURE__ */ I(""), O = /* @__PURE__ */ I(""), k = /* @__PURE__ */ F(() => H(r).commentDetails?.selection ?? H(r).nodeDetails), A = /* @__PURE__ */ F(() => H(k) ? JSON.stringify([
		H(k).documentNamespace ?? "",
		H(k).selectionKey,
		H(k).address,
		H(r).commentDetails ? "comment" : H(r).nodeDetails?.guideKey ?? H(r).nodeDetails?.operation
	]) : ""), j = /* @__PURE__ */ F(() => H(D) === "node-guide" ? H(r).commentDetails ? su(H(r).commentDetails.comment) : ou(H(r).nodeDetails) : null);
	Cn(() => {
		H(D) === "node-guide" && (H(O) !== H(A) || !H(j)) && _e();
	});
	let M = /* @__PURE__ */ F(() => ({
		examples: "Examples",
		"run-details": "Run details",
		"story-documents": "Workflow Data",
		"memory-recall": "Memory recall",
		"validate-workflow": "Workflow validation",
		"node-reference": "Node reference",
		shortcuts: "Keyboard shortcuts",
		about: "About Lattice"
	})[H(D)] ?? "Workspace guide"), ee = /* @__PURE__ */ F(() => H(D) === "node-guide" && H(j) ? `${H(j).title} guide` : H(M)), te = /* @__PURE__ */ F(() => H(r).rootWorkflow ?? H(r).workflow), ne = /* @__PURE__ */ F(() => `${H(r).menuContextKey ?? ""}:${H(r).graphId}:${H(r).graphViews?.active.key ?? ""}:${H(r).graphViews?.viewEpoch ?? ""}`), re = /* @__PURE__ */ F(() => JSON.stringify([
		H(ne),
		H(k)?.revision ?? "",
		!!H(r).guideInsertionBusy
	])), ie = /* @__PURE__ */ F(() => n().logoUrl ? new URL("../docs/node-reference.md", n().logoUrl).href : ""), ae = /* @__PURE__ */ F(() => n().logoUrl ? new URL("../README.md", n().logoUrl).href : ""), oe = /* @__PURE__ */ I(null), se = null, ce = 0, le = /* @__PURE__ */ I(0), ue;
	function de() {
		try {
			localStorage.setItem(g, JSON.stringify({
				height: H(y),
				collapsed: H(b),
				shelfOpen: H(S)
			}));
		} catch {}
	}
	function fe() {
		n().resizeStart?.();
	}
	function pe(e) {
		fe(), L(b, e, !0), de();
	}
	function me() {
		pe(!1);
	}
	function he(e) {
		let t = H(r).outputPreview;
		if (!t) return;
		if (e === "follow-preview" || e === "pin-preview" && t.pinned) {
			n().outputPreview?.follow?.();
			return;
		}
		let i = t.choices.find((e) => e.key === t.selectedKey);
		if (!i || t.status === "removed") return;
		let a = structuredClone(i.target);
		e === "pin-preview" ? n().outputPreview?.pin?.(t.sourceKey, a) : e === "run-preview" && t.runHere?.enabled && !t.busy && !H(te)?.ownedBusy && (pe(!1), n().outputPreview?.runHere?.(t.sourceKey, a));
	}
	async function ge(e) {
		if (e === "show-preview") pe(!1);
		else if (e === "collapse-preview") pe(!0);
		else if (e === "toggle-preview") pe(!H(b));
		else if (e === "toggle-shelf") fe(), L(S, !H(S)), de();
		else if (e === "reset-layout") fe(), L(y, 240), L(b, !1), L(S, !0), E(258), H(r).inspectorOpen || n().command("inspector"), de();
		else if (e === "add-node") L(S, !0), de(), await mr(), ue.openSearch();
		else if ([
			"follow-preview",
			"pin-preview",
			"run-preview"
		].includes(e)) he(e);
		else {
			se = document.activeElement, e === "examples" && n().refreshExamples?.(), e === "story-documents" && n().storyDocuments?.refresh?.(), e === "memory-recall" && n().recall?.refresh?.();
			let t = ++ce;
			L(D, e, !0), await mr(), t === ce && H(D) === e && H(oe)?.querySelector("button")?.focus();
		}
	}
	function _e() {
		ce++, L(D, ""), se?.focus({ preventScroll: !0 });
	}
	function ve() {
		L(O, H(A), !0), ge("node-guide");
	}
	async function ye(e) {
		let t = ce;
		try {
			let r = await n().openExample?.(e);
			return r === !0 && t === ce && H(D) === "examples" && _e(), r === !0;
		} catch {
			return !1;
		}
	}
	function be(e) {
		if (e.stopPropagation(), e.key === "Escape") e.preventDefault(), n().portalManager?.close?.();
		else if (e.key === "Tab") {
			let t = [...e.currentTarget.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex=\"0\"]")], n = t[0], r = t.at(-1);
			e.shiftKey && document.activeElement === n && (e.preventDefault(), r?.focus()), !e.shiftKey && document.activeElement === r && (e.preventDefault(), n?.focus());
		}
	}
	function xe(e) {
		if (e.stopPropagation(), e.key === "Escape" && (e.preventDefault(), e.stopPropagation(), _e()), e.key === "Tab") {
			let t = [...H(oe).querySelectorAll("a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex=\"0\"]")].filter((e) => !e.closest("[inert]") && e.getClientRects().length > 0), n = t[0], r = t.at(-1);
			e.shiftKey && document.activeElement === n && (e.preventDefault(), r?.focus()), !e.shiftKey && document.activeElement === r && (e.preventDefault(), n?.focus());
		}
	}
	Fi(() => {
		let e = () => {
			L(x, Math.max(90, s.clientHeight - 190), !0), L(w, Math.max(220, Math.min(520, (a.clientWidth || i.clientWidth || window.innerWidth) - 368)), !0);
		}, t = globalThis.ResizeObserver;
		if (!t) return e(), window.addEventListener("resize", e), () => window.removeEventListener("resize", e);
		let n = new t(e);
		return n.observe(s), n.observe(a), e(), () => n.disconnect();
	});
	var Se = {
		getParts: d,
		updateActions: f,
		update: p,
		renameGraphView: m,
		focusCommentTitle: h,
		revealPreview: me
	}, Ce = qp();
	let we, Te;
	var Ee = R(Ce);
	{
		let e = /* @__PURE__ */ F(() => ({
			previewOpen: !H(b),
			shelfOpen: H(S)
		}));
		Ni(Ko(Ee, {
			get state() {
				return H(r);
			},
			get actions() {
				return n();
			},
			local: ge,
			get panels() {
				return H(e);
			}
		}), (e) => l = e, () => l);
	}
	var De = B(Ee, 2), N = R(De), Oe = R(N);
	let ke, Ae;
	var je = R(Oe), Me = B(R(je)), Ne = R(Me, !0);
	P(Me), P(je);
	var Pe = B(je, 2), Fe = R(Pe);
	{
		let e = /* @__PURE__ */ F(() => H(r).outputPreview ?? null);
		ku(Fe, {
			get view() {
				return H(e);
			},
			get actions() {
				return n().outputPreview;
			},
			collapse: () => pe(!0)
		});
	}
	P(Pe), P(Oe);
	var Ie = B(Oe, 2), Le = (e) => {
		{
			let t = /* @__PURE__ */ F(() => Math.min(H(y), H(x)));
			Jo(e, {
				get height() {
					return H(t);
				},
				get max() {
					return H(x);
				},
				start: fe,
				change: (e) => {
					L(y, e, !0), de();
				}
			});
		}
	};
	J(Ie, (e) => {
		H(b) || e(Le);
	});
	var Re = B(Ie, 2);
	Ni(os(Re, {
		get views() {
			return H(r).graphViews;
		},
		get actions() {
			return n().graphViewActions;
		},
		panelId: "pc-workspace-graph"
	}), (e) => u = e, () => u);
	var ze = B(Re, 2);
	{
		let e = /* @__PURE__ */ F(() => H(r).graphViews?.active);
		ds(ze, {
			get view() {
				return H(e);
			},
			get actions() {
				return n().graphViewActions;
			}
		});
	}
	var Be = B(ze, 2), Ve = R(Be), He = R(Ve);
	{
		let e = /* @__PURE__ */ F(() => H(r).runMeter ?? null);
		Uu(He, {
			get view() {
				return H(e);
			},
			open: () => {
				L(D, "run-details");
			}
		});
	}
	P(Ve);
	var Ge = B(Ve, 2);
	Ni(Ge, (e) => o = e, () => o);
	var Ke = B(Ge, 2), qe = (e) => {
		var t = Up();
		go(R(t), { get issue() {
			return H(r).nativeDiagnostic;
		} }), P(t), K(e, t);
	};
	J(Ke, (e) => {
		H(r).nativeDiagnostic && e(qe);
	});
	var Je = B(Ke, 2);
	Ni(ep(R(Je), {
		get view() {
			return H(r).workflow;
		},
		get insertionContextKey() {
			return H(ne);
		},
		get choices() {
			return H(r).nativeChoices;
		},
		get choose() {
			return n().chooseNative;
		},
		get shelfSubgraph() {
			return n().shelfSubgraph;
		},
		get readOnly() {
			return H(r).readOnly;
		}
	}), (e) => ue = e, () => ue), P(Je), P(Be), P(N), Ni(N, (e) => s = e, () => s);
	var Ye = B(N, 2), Xe = (e) => {
		var t = Lr();
		Kr(z(t), () => H(r).graphViews?.active.key ?? H(r).graphId, (e) => {
			Xo(e, {
				get width() {
					return H(T);
				},
				get max() {
					return H(w);
				},
				start: fe,
				preview: (e) => L(C, e, !0),
				change: E
			});
		}), K(e, t);
	};
	J(Ye, (e) => {
		H(r).inspectorOpen && e(Xe);
	});
	var Ze = B(Ye, 2), Qe = R(Ze), $e = B(R(Qe));
	P(Qe);
	var et = B(Qe, 2), tt = (e) => {
		let t = /* @__PURE__ */ F(() => H(r).commentDetails);
		du(e, {
			get comment() {
				return H(t).comment;
			},
			openGuide: ve,
			onPatch: (e) => n().commentDetails?.patch(H(t).selection, e),
			onCommand: (e) => n().commentDetails?.command(H(t).selection, e)
		});
	};
	J(et, (e) => {
		H(r).commentDetails && e(tt);
	});
	var nt = B(et, 2), rt = R(nt);
	{
		let e = /* @__PURE__ */ F(() => H(r).commentDetails ? null : H(r).nodeDetails ?? null);
		rl(rt, {
			get view() {
				return H(e);
			},
			get actions() {
				return n().nodeDetails;
			},
			openGuide: ve
		});
	}
	P(nt), P(Ze), Ni(Ze, (e) => c = e, () => c), P(De), Ni(De, (e) => a = e, () => a);
	var it = B(De, 2), at = (e) => {
		var t = Gp(), i = R(t);
		let a;
		var o = R(i), s = R(o), c = R(s, !0);
		P(s);
		var l = B(s), u = R(l, !0);
		P(l), P(o);
		var d = B(o, 2), f = (e) => {
			var t = Lr();
			Kr(z(t), () => H(A), (e) => {
				Ll(e, {
					get guide() {
						return H(j);
					},
					get actions() {
						return n().nodeGuide;
					},
					get contextKey() {
						return H(re);
					},
					close: _e
				});
			}), K(e, t);
		}, p = (e) => {
			var t = Lr(), i = z(t), a = (e) => {
				xp(e, {
					get examples() {
						return H(r).examples;
					},
					get issue() {
						return H(r).examplesIssue;
					},
					get retry() {
						return n().refreshExamples;
					},
					get scrollTop() {
						return H(le);
					},
					scroll: (e) => L(le, e, !0),
					open: ye
				});
			}, o = (e) => {
				{
					let t = /* @__PURE__ */ F(() => H(r).recall ?? null), i = /* @__PURE__ */ F(() => ({
						...n().recall,
						reveal: (e) => {
							_e(), n().recall?.reveal(e);
						}
					}));
					sf(e, {
						get view() {
							return H(t);
						},
						get actions() {
							return H(i);
						}
					});
				}
			}, s = (e) => {
				{
					let t = /* @__PURE__ */ F(() => H(r).storyDocuments ?? {
						key: "",
						revision: "",
						scope: {
							userId: "",
							chatId: ""
						},
						documents: [],
						issue: "Workflow Data setup is unavailable."
					});
					Qd(e, {
						get view() {
							return H(t);
						},
						get actions() {
							return n().storyDocuments;
						},
						close: _e
					});
				}
			}, c = (e) => {
				{
					let t = /* @__PURE__ */ F(() => H(r).runDetails ?? null);
					zu(e, {
						get view() {
							return H(t);
						},
						get actions() {
							return n().runDetails;
						}
					});
				}
			}, l = (e) => {
				Vp(e, {
					get panel() {
						return H(D);
					},
					get workflow() {
						return H(te);
					},
					get version() {
						return Hp.version;
					},
					get referenceUrl() {
						return H(ie);
					},
					get guideUrl() {
						return H(ae);
					}
				});
			}, u = (e) => {
				var t = Wp(), n = B(z(t), 5), r = R(n), i = B(r, 2);
				P(n), V(() => {
					Z(r, "href", H(ae)), Z(i, "href", H(ie));
				}), K(e, t);
			};
			J(i, (e) => {
				H(D) === "examples" ? e(a) : H(D) === "memory-recall" ? e(o, 1) : H(D) === "story-documents" ? e(s, 2) : H(D) === "run-details" ? e(c, 3) : H(D) === "help" ? e(u, -1) : e(l, 4);
			}), K(e, t);
		};
		J(d, (e) => {
			H(D) === "node-guide" && H(j) ? e(f) : e(p, -1);
		}), P(i), Ni(i, (e) => L(oe, e), () => H(oe)), P(t), V(() => {
			a = pi(i, 1, "pc-workspace-dialog svelte-1dr9aew", null, a, {
				"pc-examples-dialog": H(D) === "examples",
				"pc-node-guide-dialog": H(D) === "node-guide"
			}), Z(i, "aria-label", H(ee)), q(c, H(ee)), Z(l, "aria-label", H(D) === "memory-recall" ? "Close" : "Close panel"), q(u, H(D) === "memory-recall" ? "Close" : "×");
		}), W("keydown", i, xe), U("paste", i, (e) => e.stopPropagation()), W("click", l, _e), K(e, t);
	};
	J(it, (e) => {
		H(D) && e(at);
	});
	var ot = B(it, 2);
	Of(ot, {
		get view() {
			return H(r).nativeSearch;
		},
		get actions() {
			return n().nativeSearch;
		}
	});
	var st = B(ot, 2);
	Nf(st, {
		get view() {
			return H(r).nativePinMenu;
		},
		get actions() {
			return n().nativePinMenu;
		}
	});
	var ct = B(st, 2), lt = (e) => {
		var t = Kp(), i = R(t);
		sd(R(i), {
			get view() {
				return H(r).portalManager;
			},
			get actions() {
				return n().portalManager;
			}
		}), P(i), P(t), W("keydown", i, be), U("paste", i, (e) => e.stopPropagation()), K(e, t);
	};
	J(ct, (e) => {
		H(r).portalManager && e(lt);
	});
	var ut = B(ct, 2), dt = (e) => {
		mf(e, {
			get view() {
				return H(r).configureNode;
			},
			get actions() {
				return n().configureNode;
			}
		});
	};
	J(ut, (e) => {
		H(r).configureNode && e(dt);
	});
	var ft = B(ut, 2), pt = (e) => {
		Ed(e, {
			get view() {
				return H(r).addSystem;
			},
			get actions() {
				return n().addSystem;
			}
		});
	};
	J(ft, (e) => {
		H(r).addSystem && n().addSystem && e(pt);
	});
	var mt = B(ft, 2), ht = (e) => {
		Ad(e, {
			get view() {
				return H(r).subgraphSave;
			},
			get actions() {
				return n().subgraphSave;
			}
		});
	};
	J(mt, (e) => {
		H(r).subgraphSave && e(ht);
	});
	var gt = B(mt, 2), _t = (e) => {
		jp(e, {
			get view() {
				return H(r).importReview;
			},
			get actions() {
				return n();
			}
		});
	};
	J(gt, (e) => {
		H(r).importReview && e(_t);
	});
	var vt = B(gt, 2), yt = (e) => {
		{
			let t = /* @__PURE__ */ F(() => H(r).document?.native ?? !1);
			vf(e, {
				get view() {
					return H(r).documentPrompt;
				},
				get actions() {
					return n().documentPrompt;
				},
				get native() {
					return H(t);
				}
			});
		}
	};
	return J(vt, (e) => {
		H(r).documentPrompt && e(yt);
	}), P(Ce), Ni(Ce, (e) => i = e, () => i), V((e) => {
		we = pi(Ce, 1, "pc-root pc-native-workspace svelte-1dr9aew", null, we, { "pc-native-flat": H(r).nativeFlatCanvas }), Te = hi(Ce, "", Te, { "--pc-details-width": `${H(T)}px` }), ke = pi(Oe, 1, "pc-preview-pane", null, ke, { "pc-preview-collapsed": H(b) }), Ae = hi(Oe, "", Ae, e), Z(Me, "aria-label", H(b) ? "Expand preview" : "Collapse preview"), Z(Me, "title", H(b) ? "Expand preview" : "Collapse preview"), Z(Me, "aria-expanded", !H(b)), q(Ne, H(b) ? "▾" : "▴"), Z(Pe, "hidden", H(b)), Z(Je, "hidden", !H(S)), Z(Ze, "hidden", !H(r).inspectorOpen), Z(nt, "hidden", !!H(r).commentDetails);
	}, [() => ({ "--pc-preview-height": `${Math.min(H(y), H(x))}px` })]), W("click", Me, () => pe(!H(b))), W("click", $e, () => n().command("inspector")), K(e, Ce), We(Se);
}
Er(["click", "keydown"]);
//#endregion
//#region ui/entry.js
function Yp(e, t) {
	let n = document.createElement("div");
	n.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;pointer-events:none", n.setAttribute("aria-hidden", "true"), n.inert = !0, e.append(n);
	let r;
	try {
		r = zr(na, {
			target: n,
			props: {
				card: t,
				actions: {
					hoverPin() {},
					hostResult() {}
				}
			}
		}), zt();
		let { width: e, height: i } = n.querySelector(".pc-node").getBoundingClientRect();
		return {
			width: e,
			height: i
		};
	} finally {
		r && Ur(r), n.remove();
	}
}
function Xp(e, t) {
	let n = zr(Eo, {
		target: e,
		props: { actions: t }
	});
	return zt(), {
		...n.getLayers(),
		applyScene: (e) => zt(() => n.applyScene(e)),
		setWirePreview: (e) => zt(() => n.setWirePreview(e)),
		setVisualStatus: (e) => zt(() => n.setVisualStatus(e)),
		setComments: (e, t) => zt(() => n.setComments(e, t)),
		setRecallStatus: (e) => zt(() => n.setRecallStatus(e)),
		setPreviewTarget: (e) => zt(() => n.setPreviewTarget(e)),
		setNodes: (e) => zt(() => n.setNodes(e)),
		setNodeProfiles: (e) => zt(() => n.setNodeProfiles(e)),
		setGroups: (e) => zt(() => n.setGroups(e)),
		setWires: (e, t, r) => zt(() => n.setWires(e, t, r)),
		setPositions: (e, t, r) => zt(() => {
			n.setPositions(e, t), r && n.applyScene(r);
		}),
		destroy: () => Ur(n)
	};
}
function Zp(e, t) {
	let n = zr(Jp, {
		target: e,
		props: { actions: t }
	});
	return zt(), {
		...n.getParts(),
		update: (e) => zt(() => n.update(e)),
		updateActions: (e) => zt(() => n.updateActions(e)),
		revealPreview: () => zt(() => n.revealPreview()),
		renameGraphView: (e) => n.renameGraphView(e),
		focusCommentTitle: (e, t) => n.focusCommentTitle(e, t),
		destroy: () => Ur(n)
	};
}
//#endregion
export { Yp as measureNodeCard, Xp as mountCanvas, Zp as mountWorkbench };
