var 
  /* classes */
	JSOperationQueue,
	JSAsyncBlockOperation, 
	JSBlockOperation, 
	JSOperation,
	JSBlock,
	JSInvalidArgumentException,

	/* queue priorities */
	 JSOperationQueuePriorityVeryLow = -8,
	     JSOperationQueuePriorityLow = -4,
	  JSOperationQueuePriorityNormal =  0,
	    JSOperationQueuePriorityHigh =  4,
	JSOperationQueuePriorityVeryHigh =  8;

(function(){
	
	/**
	 * applies simply inheritance by copying prototype
	 * @param  {Function} childClass
	 * @param  {Function} parentClass
	 */
	var extend = function(childClass, parentClass){
		// move prototype over to child
		var o = function(){};
		o.prototype = parentClass.prototype;
		childClass.prototype = new o();

		// copy over class variables to child
		for (var classVar in parentClass)
			childClass[classVar] = parentClass[classVar];
	};

	/**
	 * removes val from arr by splicing
	 * @param  {[type]} arr
	 * @param  {[type]} val
	 * @return {Object} the value removed
	 */
	var remove = function(arr, val){
		for (var i = arr.length; i--;)
			if (arr[i] === val)
				return arr.splice(i, 1); 
				
	};

	var exists = function(arr, val){
		for (var i = arr.length; i--;)
			if (arr[i] === val)
				return true;
	};

	JSInvalidArgumentException = function(message){
		this.message = message;
	};
	extend(JSInvalidArgumentException, Error);
	JSInvalidArgumentException.prototype.name = 'JSInvalidArgumentException';

	/**
	 * Small Listener/Observable class
	 */

	// var Listener = function(){};
	// Listener.prototype.handleEvent = function(obj, eventName){};

	var Observable = function(){
		this._listeners = {};
	};
	Observable.prototype.addEventListener = function(eventName, listener){
		var listeners = this.listenersForEvent(eventName);
		if (!exists(listeners, listener))
			listeners.push(listener);
	};
	Observable.prototype.removeEventListener = function(eventName, listener){
		remove(this.listenersForEvent(eventName), listener);
	};
	Observable.prototype.listenersForEvent = function(eventName){
		return this._listeners[eventName] 
				|| (this._listeners[eventName] = []);
	};
	Observable.prototype.fireEvent = function(eventName, data){
		var listeners = this.listenersForEvent(eventName);
		for (var i = listeners.length; i--;)
			listeners[i].handleEvent(eventName, this, data);
	};



	/** 
	 * JSOperationQueue - a JS port of NSOperationQueue
	 * see: http://developer.apple.com/documentation/Cocoa/Reference/NSOperationQueue_class
	 */
	
	JSOperationQueue = function(){
		Observable.call(this);
		this._operations = [];
	};
	extend(JSOperationQueue, Observable);

	JSOperationQueue.prototype._maxConcurrentOperationCount = 1024;

	/**
	 * Managing Operations in the Queue
	 */

	JSOperationQueue.prototype.operations = function(){
		return this._operations;
	};

	JSOperationQueue.prototype.addOperation = function(op){
		this._operations.push(op);
		this.manageExecution();
	};

	JSOperationQueue.prototype.addOperations = function(ops){
		for (var i = ops.length; i--;)
			this._operations.push(ops[i]);
		this.manageExecution();
	};

	JSOperationQueue.prototype.addOperationWithBlock = function(block){
		this.addOperation(
			JSBlockOperation.blockOperationWithBlock(block)
		);
		this.manageExecution();
	};

	JSOperationQueue.prototype.removeOperation = function(op){
		remove(this._operations, op);
		this.manageExecution();
	};

	JSOperationQueue.prototype.operationCount = function(){
		return this._operations.length;
	};

	JSOperationQueue.prototype.cancelAllOperations = function(){
		for (var i = this._operations.length; i--;)
			this._operations[i].cancel();
		this.manageExecution();
	};


	/**
	 * Managing the Number of Running Operations
	 */
	
	JSOperationQueue.prototype.maxConcurrentOperationCount = function(){
		return this._maxConcurrentOperationCount;
	};

	JSOperationQueue.prototype.setMaxConcurrentOperationCount = 
		function(maxConcurrentOperationCount){
			this._maxConcurrentOperationCount = maxConcurrentOperationCount;
		};


	/**
	 * Suspending Operations
	 */

	JSOperationQueue.prototype.setSuspended = function(suspended){
		this._suspended = suspended;
		this.manageExecution();
	};

	JSOperationQueue.prototype.isSuspended = function(){
		return this._suspended;
	};


	/**
	 * Managing the Queue’s Name
	 */

	JSOperationQueue.prototype.setName = function(name){
		this._name = name;
	};

	JSOperationQueue.prototype.name = function(){
		return this._name;
	}


	/**
	 * Managing the Execution
	 */

	JSOperationQueue.prototype.manageExecution = function(){
		if (this._suspended) return;

		var nonExecutingOperations = [];

		var operationsRunning = 0;
		for (var i = this._operations.length; i--;){
			var operation = this._operations[i];
			if (operation.isExecuting())
				++operationsRunning;
			else if (operation.isReady()){
				nonExecutingOperations.splice(_.sortedIndex(nonExecutingOperations, operation, function(op){
					return op.queuePriority();
				}), 0, operation);
			}
		}

		var oThis = this;
		for (var i = nonExecutingOperations.length; operationsRunning++ < this._maxConcurrentOperationCount && i--;)
			var op = nonExecutingOperations[i];
			setTimeout(function(){
				if (op.isReady())
					op.start();
				else oThis.manageExecution();
				//op.addEventListener('isExecuting', this);
			}, 0);
		}
	};

	JSOperationQueue.prototype.handleEvent = function(eventName, sender, data){
		if (eventName == 'isExecuting') this.manageExecution();
	};






	/** 
	 * JSOperation - a JS port of NSOperation
	 * see: http://developer.apple.com/documentation/Cocoa/Reference/NSOperation
	 */

	JSOperation = function(){
		Observable.call(this);
		this._dependencies = [];
		this.addEventListener('isFinished', this);
	};
	extend(JSOperation, Observable);

	JSOperation.prototype._isCancelled = false;
	JSOperation.prototype._isExecuting = false;
	JSOperation.prototype._isFinished = false;
	JSOperation.prototype._isConcurrent = false;
	JSOperation.prototype._queuePriority = JSOperationQueuePriorityNormal;
	JSOperation.prototype._threadPriority = 0.5;


	/** 
	 * Executing the Operation
	 */
	
	JSOperation.prototype.start = function(){
		if (!this.isReady()){
			throw new JSInvalidArgumentException(
				'*** -[__JSOperationInternal start]: receiver is not yet ready to execute'
			);
			return;
		}
		this._isFinished = !(this._isExecuting = true);
		this.main();
		this._isFinished = !(this._isExecuting = false);
		this.fireEvent('isFinished');
	};

	JSOperation.prototype.main = function(){};

	JSOperation.prototype.completionBlock = function(){
		return this._completionBlock;
	};

	JSOperation.prototype.setCompletionBlock = function(block){
		this._completionBlock = block;
	};


	/**
	 * Cancelling Operations
	 */
	
	JSOperation.prototype.cancel = function(){
		this._isCancelled = true;
	};


	/**
	 * Getting the Operation Status
	 */
	
	JSOperation.prototype.isCancelled = function(){
		return this._isCancelled;
	};
	
	JSOperation.prototype.isExecuting = function(){
		return this._isExecuting;
	};

	JSOperation.prototype.isFinished = function(){
		return this._isFinished;
	};

	JSOperation.prototype.isConcurrent = function(){
		return this._isConcurrent;
	};

	JSOperation.prototype.isReady = function(){
		for (var i = this._dependencies.length; i--;)
			if (!this._dependencies[i].isFinished())
				return false;
		return true;
	};

	JSOperation.prototype.handleEvent = function(eventName, sender){
		switch(eventName){
			case 'isFinished':
				if (this._completionBlock)
					this._completionBlock.execute();
			break;

			case 'isReady':
				this.fireEvent('isReady');
		}
	}


	/**
	 * Managing Dependencies
	 */
	
	JSOperation.prototype.addDependency = function(op){
		op.addEventListener('isFinished', this);
		this._dependencies.push(op);
	};
	
	JSOperation.prototype.removeDependency = function(op){
		op.removeEventListener('isFinished', this);
		remove(this._dependencies, op);
	};

	// warning: do not modify dependencies obtained below
	JSOperation.prototype.dependencies = function(){
		return this._dependencies;
	};


	/**
	 * Prioritizing Operations in an Operation Queue
	 */

	JSOperation.prototype.queuePriority = function(){
		return this._queuePriority;
	};

	JSOperation.prototype.setQueuePriority = function(queuePriority){
		this._queuePriority = queuePriority;
	};

	
	/**
	 * Managing the Execution Priority
	 */

	JSOperation.prototype.threadPriority = function(){
		return this._threadPriority;
	};

	JSOperation.prototype.setThreadPriority = function(threadPriority){
		this._threadPriority = threadPriority;
	};	


	/**
	 * Waiting for Completion
	 */

	JSOperation.prototype.waitUntilFinished = function(){

	};




	/** 
	 * JSBlockOperation - a JS port of NSBlockOperation
	 * see: http://developer.apple.com/documentation/Cocoa/Reference/NSBlockOperation
	 */

	JSBlockOperation = function(){
		JSOperation.call(this);
		this._executionBlocks = [];
	};
	extend(JSBlockOperation, JSOperation);

	JSBlockOperation.prototype.main = function(){
		for (var i = 0; i < this._executionBlocks.length; ++i)
			this._executionBlocks[i].execute();
	};

		
	/**
	 * Managing the Blocks in the Operation
	 */
	
	JSBlockOperation.blockOperationWithBlock = function(block){
		var op = new this();
		op.addExecutionBlock(block);
		return op;
	};

	JSBlockOperation.prototype.addExecutionBlock = function(block){
		if (this.isExecuting() || this.isFinished()){
			throw new JSInvalidArgumentException(
				'*** -[__JSOperationInternal addExecutionBlock]: operation is already executing or finished'
			);
			return;
		}
		this._executionBlocks.push(block);
	};

	JSBlockOperation.prototype.executionBlocks = function(){
		return this._executionBlocks;
	};




	/** 
	 * JSAsyncBlockOperation - a block operation, but asynchronous
	 * the block is passed a callback function
	 * the callback should be called when finished
	 * see: http://developer.apple.com/documentation/Cocoa/Reference/NSBlockOperation
	 */

	JSAsyncBlockOperation = function(){
		JSBlockOperation.call(this);
	};
	extend(JSAsyncBlockOperation, JSBlockOperation);

	JSAsyncBlockOperation.prototype.start = function(){
		this._isFinished = !(this._isExecuting = true);
		var i = 0, oThis = this, 
		execNextBlock = function(){
			if (i >= oThis._executionBlocks.length){
				oThis._isFinished = !(oThis._isExecuting = false);
				oThis.fireEvent('isFinished');
				return;
			}
			oThis._executionBlocks[i++].execute(execNextBlock);
		};
		execNextBlock();
	};




	/** 
	 * JSBlock - a wrapper around functions
	 * provides optional context that will be apply'ed to function
	 */
	
	JSBlock = function(fn, context){
		if (fn) this._executionFunction = fn;
		this._context = context || {};
	};

	JSBlock.prototype._executionFunction = function(){};


	/**
	 * Manage the block's execution function
	 */
	
	JSBlock.prototype.executionFunction = function(){
		return this._executionFunction;
	};

	JSBlock.prototype.setExecutionFunction = function(fn){
		this._executionFunction = fn;
	};


	/**
	 * Manage the block's execution context
	 */
	
	JSBlock.prototype.context = function(){
		return this._context;
	};

	JSBlock.prototype.setContext = function(context){
		this._context = context;
	};

	JSBlock.prototype.setContextValueForKey = function(key, value){
		this._context[key] = value;
	};

	JSBlock.prototype.getContextValueForKey = function(key){
		return this._context[key];
	};

	JSBlock.prototype.removeContextValueForKey = function(key){
		delete this._context[key];
	};


	/**
	 * Execute the block
	 */

	JSBlock.prototype.execute = function(){
		return this._executionFunction.apply(this._context, arguments);
	};

})();
