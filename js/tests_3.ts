import { Cell } from "ton";
import { contractLoader, cell, suint, int, zeros, cellToBoc, sint } from './shared.js';




let initialData = cell();
let contract = await contractLoader('./../func/typehelpers.fc', './../func/3.fc')(initialData);

async function testMessage(cellToVerify: Cell) {
	const exres = await contract.invokeGetMethod('validate_message', [
		{ type: 'cell', value: cellToBoc(cellToVerify) },
	]);
	console.log('logs:', exres.logs);
	if (exres.type !== 'success' || exres.exit_code > 0) {
		throw new Error(`exit_code = ${exres.exit_code}, .type = ${exres.type}`);
	}

	const { result } = exres;
	console.log(result);

	// const resCell = result[0] as Cell;
	// const resAddress = resCell.bits.buffer.toString('utf-8');
	
	// if (resAddress !== userFriendlyAddress) {
	// 	throw new Error(`Incorrect value, expected: ${userFriendlyAddress}, found: ${resAddress}`);
	// }
	// console.log(`testMessage() passed, address = ${resAddress}`);
}


await testMessage(cell());
