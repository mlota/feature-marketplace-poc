trigger AccountPostConfiguration on Account (after insert) {
	for (Account acc : Trigger.New) {
			System.debug('New Account inserted: ' + acc.Name);
	}
}