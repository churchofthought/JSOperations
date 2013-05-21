JSOperations.js
==========

JSOperations is a lightweight library for queueing operations. It provides a JSOperationsQueue class which can have a maxConcurrentOperationCount to limit the number of tasks running at a single time.
Operations can be suspended, cancelled, and can have a queuePriority set, which will determine the order in which they execute.

Here's a quick example of what JSOperations does:

```javascript
var queue = new JSOperationQueue();

var fib = new JSAsyncBlockOperation(function(op, blk){
	this.results.push(this.results[0] + this.results[1]);
	this.results.shift();

	if (++this.i >= 500) op.finish();
	else op.suspend();
  
}, {i: 1, results:[0,1]});
fib.resumptionBlock(fib.executionBlock()); // fib should resume at its execution block
```
