
build: components index.js
	@component build --dev

components: component.json
	@component install --dev

install: components build/build.js
	component build --standalone bolt --out . --name _index

clean:
	rm -fr build components template.js js

.PHONY: clean
