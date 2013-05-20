var 
    /**
     * Public Classes
     */
	JSOperationQueue,
	JSAsyncBlockOperation, 
	JSBlockOperation, 
	JSOperation,
	JSBlock,
	JSInvalidArgumentException,

	/**
	 * Queue Priority Constants
	 * - you don't have to use these
	 * - you can use any Number instead
	 * @type {Number}
	 */
	 JSOperationQueuePriorityVeryLow = -8,
	     JSOperationQueuePriorityLow = -4,
	  JSOperationQueuePriorityNormal =  0,
	    JSOperationQueuePriorityHigh =  4,
	JSOperationQueuePriorityVeryHigh =  8;

(function(){
	
	/**
	 * applies simply inheritance by copying prototype
	 * 
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
	 * 
	 * @param  {Array} arr
	 * @param  {Object} val
	 * @return {Object} the value removed
	 */
	var remove = function(arr, val){
		for (var i = arr.length; i--;)
			if (arr[i] === val)
				return arr.splice(i, 1); 
				
	};

	/**
	 * returns whether value exists in array
	 * 
	 * @param  {Array} arr
	 * @param  {Object} val
	 * @return {Boolean} whether the value exists in array
	 */
	var exists = function(arr, val){
		for (var i = arr.length; i--;)
			if (arr[i] === val)
				return i;
		return false;
	};

	/**
	 * gets the insertion index for an op into an array sorted by queue priority
	 * 
	 * @param  {Array} arr  the array of operations, sorted by queue priority
	 * @param  {JSOperation} op  the operation that will be inserted
	 * @return {Number} the insertion index
	 */
	var indexForOpByPriority = function(arr, op) {
      var low = 0,
          high = arr.length,
          qp = op.queuePriority();

      while (low < high) {
        var mid = (low + high) >>> 1;
        if (arr[mid].queuePriority() < qp)
          low = mid + 1;
     	else
          high = mid;
      }

      return low;
    };

	/**
	 * thrown by JSOperation classes
	 * 
	 * @constructor
	 */
	JSInvalidArgumentException = function(message){
		this.message = message;
	};
	extend(JSInvalidArgumentException, Error);
	JSInvalidArgumentException.prototype.name = 'JSInvalidArgumentException';

	/**
	 * Small Listener/Observable class, used internally by Operations
	 *
	 * Listener
	 *
	 * Listener.prototype.handleEvent(obj, eventName, data)
	 *
	 */

	/**
	 * inherited by Operations
	 *
	 * @constructor
	 */
	var Observable = function(){
		this._listeners = {};
	};

	/**
     * creates a getter/setter that fires events when value changes
     * @param  {String|String[]} propertyName  the property name(s)
     */
    Observable.createProperty = function(propertyName, defaultValue){
    	var ivar = '_' + propertyName;
    	this.prototype[ivar] = defaultValue;
    	this.prototype[propertyName] = function(val){
			if (arguments.length && val !== this[ivar])
				this.fireEvent(propertyName, this[ivar] = val)
				
			return this[ivar];
		};
		return ivar;
    };

    Observable.createProperties = function(){
    	var defaultValue = arguments[arguments.length - 1];
		for (var i = arguments.length - 1; i--;)
			this.createProperty(arguments[i], defaultValue);
    };

    Observable.prototype.addEventListener = function(eventName, listener){
    	var listeners = this.listenersForEvent(eventName);
		if (exists(listeners, listener) === false)
			listeners.push(listener);

		return this;
    };

	Observable.prototype.addEventListeners = function(){
		var listener = arguments[arguments.length - 1];

		for (var i = arguments.length - 1; i--;)
			this.addEventListener(arguments[i], listener);

		return this;
	};

	Observable.prototype.removeEventListener = function(eventName, listener){
		remove(this.listenersForEvent(eventName), listener);
		return this;
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
	
	/**
	 * creates an instance of JSOperationQueue
	 * 
	 * @constructor
	 */
	JSOperationQueue = function(){
		Observable.call(this);
		this._operations = [];
		this.addEventListener('isSuspended', this);
	};
	extend(JSOperationQueue, Observable);

	JSOperationQueue.createProperty('maxConcurrentOperationCount', 8);
	JSOperationQueue.createProperty('isSuspended', false);
	JSOperationQueue.createProperty('name', 'JSOperationQueue');

	/**
	 * Managing Operations in the Queue
	 */

	/**
	 * returns the currently queued operations
	 * you should not mutate this, instead use @addOperation and JSOperation.cancel
	 * 
	 * @return {JSOperation[]} array of the operations currently in queue
	 */
	JSOperationQueue.prototype.operations = function(){
		return this._operations;
	};

	/**
	 * adds an operation to the queue
	 * 
	 * @param  {JSOperation} op
	 * @return {JSOperation} the operation that was added to the queue
	 */
	JSOperationQueue.prototype.addOperation = function(op){
		this._operations.push(
			op.addEventListeners('isExecuting', 'isFinished', this)
		);

		this.manageExecution();

		return op;
	};

	/**
	 * adds multiple operations to the queue
	 * 
	 * @param  {...JSOperation} ops
	 */
	JSOperationQueue.prototype.addOperations = function(){
		for (var i = arguments.length; i--;)
			this._operations.push(
				arguments[i].addEventListeners('isExecuting', 'isFinished', this)
			);
		this.manageExecution();
	};

	/**
	 * Adds a block operation to the operation queue
	 * 
	 * @param  {JSBlock|Function} block  if this is a Function, a JSBlock will be created
	 * @param  {Object=} ctx  the context for block function, if a function is passed
	 * @return {JSBlockOperation} the block operation that was created and added to the queue
	 */
	JSOperationQueue.prototype.addOperationWithBlock = function(block, ctx){
		return this.addOperation(
			JSBlockOperation.blockOperationWithBlock(block, ctx)
		);
	};

	/**
	 * returns the number of operations in the queue
	 * 
	 * @return {Number}
	 */
	JSOperationQueue.prototype.operationCount = function(){
		return this._operations.length;
	};

	/**
	 * cancels all operations in the queue
	 */
	JSOperationQueue.prototype.cancelAllOperations = function(){
		for (var i = this._operations.length; i--;)
			this._operations[i].cancel();
	};

	/**
	 * suspends the execution of operations
	 */
	JSOperationQueue.prototype.suspend = function(){
		this.isSuspended(true);
	};


	/**
	 * Managing the Execution
	 */

	/**
	 * internal method, manages execution of operations
	 */
	JSOperationQueue.prototype.manageExecution = function(){
		if (this.isSuspended()) return;

		var nonExecutingOperations = [];

		var operationsRunning = 0;
		for (var i = this._operations.length; i--;){
			var operation = this._operations[i];
			if (operation.isExecuting())
				++operationsRunning;
			else if (operation.isReady()){
				nonExecutingOperations.splice(indexForOpByPriority(nonExecutingOperations, operation), 0, operation);
			}
		}

		var oThis = this;
		for (var i = nonExecutingOperations.length; 
			operationsRunning++ < this._maxConcurrentOperationCount && i--; ){
			var op = nonExecutingOperations[i];
			setTimeout(function(){
				if (op.isReady())
					if (op.isSuspended())
						op.resume();
					else
						op.start();
				else oThis.manageExecution();
			}, 0);
		}
	};

	/**
	 * internal method, implemented to respond to Observable events
	 * 
	 * @param  {String} eventName
	 * @param  {Object} sender
	 * @param  {Object} data
	 */
	JSOperationQueue.prototype.handleEvent = function(eventName, sender, propertyValue){
		if (sender === this && eventName === 'isSuspended'){
			if (propertyValue){
				for (var i = this._operations.length; i--;){
					var operation = this._operations[i];
					if (operation.isExecuting())
						operation.suspend();
				}
			}
			this.manageExecution();
		}else switch (eventName){
	 		case 'isFinished': remove(this._operations, sender);
	 		case 'isExecuting': this.manageExecution();
	 	}
	};






	/** 
	 * JSOperation - a JS port of NSOperation
	 * see: http://developer.apple.com/documentation/Cocoa/Reference/NSOperation
	 */

	/**
	 * @constructor
	 */
	JSOperation = function(){
		Observable.call(this);
		this._dependencies = [];

		this.addEventListeners('isFinished', 'isSuspended', 'isCancelled', this);
	};
	extend(JSOperation, Observable);

	JSOperation.createProperty('queuePriority', JSOperationQueuePriorityNormal);
	JSOperation.createProperties(
		'isConcurrent', 'isExecuting', 'isFinished', 
		'isSuspended', 'isCancelled', false
	);
	

	/** 
	 * Executing the Operation
	 */
	
	/**
	 * starts the operation
	 */
	JSOperation.prototype.start = function(){
		if (!this.isReady()){
			throw new JSInvalidArgumentException(
				'*** -[__JSOperationInternal start]: receiver is not yet ready to execute'
			);
			return;
		}
		this.isExecuting(true);
		try {
			this.main();
		}catch(e){
			this.isFinished(true);
			throw e;
			return;
		}
		if (!this.isConcurrent())
			this.isFinished(true);
	};

	JSOperation.prototype.main = function(){};


	/**
	 * Suspending/Cancelling/Resuming Operations
	 */

	JSOperation.prototype.cancel = function(){
		this.isCancelled(true);
	};

	JSOperation.prototype.suspend = function(){
		if (this.isExecuting())
			this.isSuspended(true);
	};

	JSOperation.prototype.resume = function(){
		this.isSuspended(false);
	};

	JSOperation.prototype.finish = function(){
		this.isFinished(true);
	}

	function createBlockProperty(name){
		var ivar = '_' + name;
		JSOperation.prototype[name] = function(block,ctx){
			if (!arguments.length) return this[ivar];
			this[ivar] = 
				block instanceof Function
					? new JSBlock(block, ctx)
					: block;
		};
	}

	createBlockProperty('completionBlock');
	createBlockProperty('suspensionBlock');
	createBlockProperty('resumptionBlock');
	createBlockProperty('cancellationBlock');

	/**
	 * Getting the Operation Status
	 */


	JSOperation.prototype.isReady = function(){
		for (var i = this._dependencies.length; i--;)
			if (!this._dependencies[i].isFinished())
				return false;
		return true;
	};



	/**
	 * Internal handling of events
	 */

	JSOperation.prototype.handleEvent = function(eventName, sender, propertyValue){

		switch(eventName){
			case 'isFinished':
				if (this._completionBlock)
					this._completionBlock.execute(this, this._completionBlock);
				
				this.isExecuting(false);
				break;

			case 'isCancelled':
				if (this.isExecuting())
					if (this._cancellationBlock)
						this._cancellationBlock.execute(this, this._cancellationBlock);
				else
					this.isFinished(true);
				break;

			case 'isSuspended':
				if (propertyValue){
					if (this.isExecuting()){
						this.isExecuting(false);
						if (this._suspensionBlock)
							this._suspensionBlock.execute(this, this._suspensionBlock);
					}
				}else if (this._resumptionBlock){
					this.isExecuting(true);
					this._resumptionBlock.execute(this, this._resumptionBlock);
				}
		}
	}


	/**
	 * Managing Dependencies
	 */
	
	JSOperation.prototype.addDependency = function(op){
		this._dependencies.push(op);
	};
	
	JSOperation.prototype.removeDependency = function(op){
		remove(this._dependencies, op);
	};

	// warning: do not modify dependencies obtained from this fn
	JSOperation.prototype.dependencies = function(){
		return this._dependencies;
	};



	/** 
	 * JSBlockOperation - a JS port of NSBlockOperation
	 * see: http://developer.apple.com/documentation/Cocoa/Reference/NSBlockOperation
	 */

	JSBlockOperation = function(block, ctx){
		JSOperation.call(this);

		this._executionBlocks = block 
			? [block instanceof Function 
				? new JSBlock(block, ctx) 
				: block] 
			: [];
	};
	extend(JSBlockOperation, JSOperation);

	JSBlockOperation.prototype.main = function(){
		for (var i = 0; i < this._executionBlocks.length; ++i){
			var block = this._executionBlocks[i];
			block.execute(this, block);
		}
	};

		
	/**
	 * Managing the Blocks in the Operation
	 */
	
	JSBlockOperation.blockOperationWithBlock = function(block, ctx){
		return new this().addExecutionBlock(block, ctx);
	};

	JSBlockOperation.prototype.addExecutionBlock = function(block, ctx){
		if (this.isExecuting() || this.isFinished()){
			throw new JSInvalidArgumentException(
				'*** -[__JSOperationInternal addExecutionBlock]: operation is already executing or finished'
			);
			return;
		}


		this._executionBlocks.push(
			block instanceof Function 
				? new JSBlock(block, ctx) 
				: block
		);

		return this;
	};

	JSBlockOperation.prototype.context = function(){
		return this.executionBlock().context();
	};

	JSBlockOperation.prototype.executionBlock = function(){
		return this._executionBlocks[0];
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
		JSBlockOperation.apply(this, arguments);
	};
	extend(JSAsyncBlockOperation, JSBlockOperation);
	JSAsyncBlockOperation.prototype._isConcurrent = true;
	JSAsyncBlockOperation.prototype._currentBlockIndex = -1;

	JSAsyncBlockOperation.prototype.main = function(){
		this.next();
	};

	JSAsyncBlockOperation.prototype.curr = function(){
		var block = this._executionBlocks[this._currentBlockIndex];
		block.execute(this, block);
	};

	JSAsyncBlockOperation.prototype.reset = function(){
		this._currentBlockIndex = 0;
		this.curr();
	};

	JSAsyncBlockOperation.prototype.seek = function(idx){
		this._currentBlockIndex += idx;
		this.curr();
	};

	JSAsyncBlockOperation.prototype.goto = function(block){
		this._currentBlockIndex = exists(this._executionBlocks, block);
		this.curr();
	};

	JSAsyncBlockOperation.prototype.next = function(){
		if (++this._currentBlockIndex >= this._executionBlocks.length){
			this.isFinished(true);
			return;
		}
		
		this.curr();
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
