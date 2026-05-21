
// eventBus.js
class EventBus {
	constructor() { this.map = Object.create(null); }

	on(event, cb) {
		(this.map[event] ||= new Set()).add(cb);
		return () => this.off(event, cb);       // unsubscribe helper
	}

	once(event, cb) {
		const off = this.on(event, (p) => { off(); cb(p) });
		return off;
	}

	off(event, cb) {
		const set = this.map[event]; if (!set) return;
		set.delete(cb); if (set.size === 0) delete this.map[event];
	}

	emit(event, payload) {
		const call = (set) => set && set.forEach(fn => fn(payload));
		// direct
		call(this.map[event]);
		// simple wildcard: "user:*" matches "user:login"
		const star = event.split(':')[0] + ':*';
		call(this.map[star]);
	}
}

const eventBus = new EventBus();
export default eventBus;
