import fs from 'fs';
import { partition } from 'lodash-es';
//import * as _ from 'lodash-es';

let funcProgram = '';

const tempIntName = 'temp_int';

type VariableTarget = string | undefined; // undefined - discard this value
type Variable = {
	name: string;
}
type Times = {
	a: Expression,
	b: Expression,
	toString: () => string,
};
type Expression = number | string | Variable | Times;

type Generator = () => void;

let currentVarCount = 0;
function varName(prefix: string): string {
	return prefix + (currentVarCount++);
}
function variable(name: string): Variable {
	return {
		name,
	};
}
const times = (a: Expression, b: Expression) => ({
	a, b,
	toString: () => `${a} * ${b}`,
});
const e_null = 'null()';


function g_maybe_of(generator: Generator) {
	const name = 'maybe_cons';
	g_bit(name);

	funcProgram += `
	if (${name}) {
		${generator()}
	}`;
}

function g_either_of(generatorA: Generator, generatorB: Generator) {
	const name = 'either_cons';
	g_bit(name);

	funcProgram += `
	if (${name}) {
		${generatorA()}
	} else {
		${generatorB()}
	}`;
}

function g_empty() {
	// Nothing here
}

function g_ref() {
	funcProgram += `
	if (cs.slice_refs() == 0) { return (0, null()); }
	cs~load_ref();
	`
}

function oneOf(constructors: { [key: string]: Generator }) {
	let options = Object.entries(constructors);
	let currentPrefixLen = 0;

	while (options.length > 0) {
		const minConstructorLen = Math.min(...options.map(([key, _]) => key.length));
		checkEnoughBits(minConstructorLen);
	
		let shortest;
		[shortest, options] = partition(options, ([key, value]) => key.length === minConstructorLen);
	
		const cons_var = g_uint(minConstructorLen, varName('cons'));
	}
}


function checkEnoughBits(count: Expression) {
	funcProgram += `
	if (cs.slice_bits() < ${count}) { return (0, null()); }`;
}

function g_expect_bit(b: 0 | 1) {
	funcProgram += `
	if (cs.slice_empty?()) { return (0, null()); }
	${tempIntName} = cs~load_uint(1);
	if (${tempIntName} != ${b}) { return (0, null()); }
`
}
const g_zero = () => g_expect_bit(0);
const g_one = () => g_expect_bit(1);


function g_bit(name: string): Variable {
	funcProgram += `
	if (cs.slice_empty?()) { return (0, null()); }
	int ${name} = cs~load_uint(1);
`;
	return variable(name);
}

function g_bits(count: Expression): void;
function g_bits(count: Expression, name: VariableTarget): Variable;
function g_bits(count: Expression, name?: VariableTarget): Variable | void {
	checkEnoughBits(count);
	if (name !== undefined) {
		funcProgram += `
	slice ${name} = cs~load_bits(${count});`
		return variable(name);
	}
	else
		funcProgram += `
	cs~skip_bits(${count});`;
		return;
}

function g_uint(bitLength: Expression): void;
function g_uint(bitLength: Expression, name: VariableTarget): Variable;
function g_uint(bitLength: Expression, name?: VariableTarget): Variable | void {
	checkEnoughBits(bitLength);
	funcProgram += '\n';
	if (name !== undefined) funcProgram += `int ${name} = `;
	funcProgram += `cs~load_uint(${bitLength});
`;
	if (name !== undefined)
		return variable(name);
}


function g_number_up_to(max: number, name: string): Variable {
	const bitLength = Math.ceil(Math.log2(max + 1));
	const variable = g_uint(bitLength, name);
	funcProgram += `
	if (${name} > max) { return (0, null()); }
`;
	return variable;
}
function g_number_between(min: number, max: number, name: string): Variable {
	const bitLength = Math.ceil(Math.log2(max + 1));
	const variable = g_uint(bitLength, name);
	funcProgram += `
	if (${name} < min | ${name} > max) { return (0, null()); }
`;
	return variable;
}


function g_anycast() {
	const depth_var = g_number_between(1, 30, 'depth');
	g_bits(depth_var);
}


function g_varUInteger(maxBitLength: number, name?: VariableTarget): Variable {
	const byte_len_var = g_number_up_to(maxBitLength, 'byte_len');
	return g_uint(times(byte_len_var, 8), name);
}


function g_grams(): void;
function g_grams(name: VariableTarget): Variable;
function g_grams(name?: VariableTarget): Variable | void {
	return g_varUInteger(16, name);
}


function g_addr_none(): Expression {
	return e_null;
}
function g_addr_extern(): Expression {
	const len_var = g_uint(9, 'addr_len');
	const addr_var = g_bits(len_var);
	return e_slice(
		
	)
}
function g_addr_std(): Expression {
	g_anycast();
	g_bits(8);
	g_bits(256);
}

function g_addr_var(): Expression {
	g_anycast();
	const addr_len_var = g_uint(9, 'addr_len');
	g_bits(32);
	g_bits(addr_len_var);
}

function g_msg_address_int(name: string): Variable {
	oneOf({
		'10': g_addr_std,
		'11': g_addr_var,
	});
}

function g_msg_address_ext(name: string): Variable {
	oneOf({
		'00': g_addr_none,
		'01': g_addr_extern,
	})
}


function g_hashmapE() {
	g_zero(); 
	// It is guaranteed that for all tests any HashmapE datatype in message structure
	// is empty hashmaps (has hme_empty constructor).
}


function g_extra_currency_collection() {
	g_hashmapE();
}

function g_currency_collection(amountName: string) {
	const amount_var = g_grams(amountName);
	g_extra_currency_collection();
	return amount_var;
}


type MsgInfoExps = {
	src: Expression,
	dest: Expression,
	amount: Expression,
};

function g_int_msg_info(srcName: string, destName: string, amountName: string): MsgInfoExps {
	g_bits(3); // ihr_disabled:Bool bounce:Bool bounced:Bool
	const src = g_msg_address_int(srcName);
	const dest = g_msg_address_int(destName);
	const amount = g_currency_collection(amountName);
	g_grams(); // ihr_fee:Grams
	g_grams(); // fwd_fee:Grams
	g_bits(96); // created_lt:uint64 created_at:uint32

	return { src, dest, amount };
}

function g_ext_in_msg_info(srcName: string, destName: string, amountName: string): MsgInfoExps {
	const src = g_msg_address_ext(srcName);
	const dest = g_msg_address_int(destName);
	g_grams(); // import_fee:Grams

	return {
		src, dest,
		amount: e_null,
	};
}

function g_ext_out_msg_info(srcName: string, destName: string, amountName: string) {
	const src = g_msg_address_int(srcName);
	const dest = g_msg_address_ext(destName);
	g_bits(96); // created_lt:uint64 created_at:uint32
	
	return {
		src, dest,
		amount: e_null,
	};
}

function g_common_msg_info(srcName: string, destName: string, amountName: string) {
	oneOf({
		'0': () => g_int_msg_info(srcName, destName, amountName),
		'10': () => g_ext_in_msg_info(srcName, destName, amountName),
		'11': () => g_ext_out_msg_info(srcName, destName, amountName),
	});
}


function g_tick_tock() {
	g_bits(2);
}


function g_state_init() {
	g_maybe_of(() => g_bits(5));
	g_maybe_of(g_tick_tock);
	g_maybe_of(g_ref);
	g_maybe_of(g_ref);
	g_hashmapE();
}


function g_either_state_init() {
	g_either_of(g_state_init, g_ref_state_init);
}


function g_init() {
	g_maybe_of(g_either_state_init);
}

function g_body() {
	g_either_of(g_empty, g_ref);
}

function g_message_any(srcName: string, destName: string, amountName: string) {
	g_common_msg_info(srcName, destName, amountName);
	g_init();
	g_body();
}

function g_validator() {
	const srcName = 'src';
	const destName = 'dest';
	const amountName = 'amount';

	funcProgram += '() recv_internal() {}\n\n';
	funcProgram += '(int, tuple) validate_message(cell message) method_id {';
	g_message_any(srcName, destName, amountName);

	funcProgram += `
	return (-1, [${srcName}, ${destName}, ${amountName}]);
`;
	funcProgram += '}\n';
}


g_validator();

fs.writeFileSync('3.fc', funcProgram, 'utf-8');
