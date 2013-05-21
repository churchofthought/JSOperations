JSOperations.js
==========

JSOperations is a lightweight library for queueing operations. It provides a JSOperationsQueue with a maxConcurrentOperationCount property to limit the number of tasks running at a single time.
Operations can be suspended, cancelled, and can have a queuePriority set, which will determine the order in which they execute.


Here's a quick example of what JSOperations does:
Calculating fibonacci for n=500 would normally freeze the UI. 
But if we write an operation that suspends itself, the queue will automatically resume it on the next paint cycle.


```javascript
var queue = new JSOperationQueue();

var fib = new JSAsyncBlockOperation(function(op, blk){
	this.results.push(this.results[0] + this.results[1]);
	this.results.shift();

	if (++this.i >= 500) op.finish();
	else op.suspend();
  
}, {i: 1, results:[0,1]});
fib.resumptionBlock(fib.executionBlock()); // fib should resume at its execution block

fib.completionBlock(function(op){
	console.log("fib of " + this.i + " is " + this.results.pop());
}, fib.context());
```

When an operation is resumed, its resumptionBlock is called. That is utilized in the above example.

There are 4 related blocks you can set on an operation:
suspensionBlock, resumptionBlock, cancellationBlock, and completionBlock

Because javascript code cannot be 'terminated', it is your job to set these blocks if you desire your operation to be re-entrant / terminatable.
In the above example, we don't need to set a suspensionBlock because there are no resources like lingering ajax requests to cancel.


Operations can also have dependencies. 
Let's say you need to get some json data from 2 seperate ajax requests and do something only when both requests have returned.
Here's what you can do:

```javascript
var queue = new JSOperationQueue();
var req1 = new JSAsyncBlockOperation(function(op, blk){
   $.get('data1', function(data){
      blk.context().data1 = data;
      op.finish();
   });
}, {});
var req2 = new JSAsyncBlockOperation(function(op, blk){
   $.get('data2', function(data){
      blk.context().data2 = data;
      op.finish();
   });
}, req1.context());

var resOp = new JSBlockOperation(function(op, blk){
    console.log("data1:", this.data1);
    console.log("data2:", this.data2);
}, req1.context());
resOp.dependencies([req1, req2]);
```

Dependencies can be much more complex and intertwined, the above is just a simple example.




JSOperation is the main operation class. To write a custom operation, inherit from JSOperation and override main(), the main execution function for an operation.
If your operation is not over when main() returns, you should override isConcurrent to return true. When your operation is done, call operation.finish() to let the queue, and other observers know that your operation is over.

There are 2 classes to make concurrent and non-concurrent operations without subclassing.
These are JSBlockOperation and JSAsyncBlockOperation.
