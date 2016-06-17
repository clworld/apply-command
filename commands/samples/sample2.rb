#!/usr/bin/ruby -Ku
ARGF.each do |pline|
	result = pline
		.split("\0")
		.map do |line|
			c = line.chomp!
			line += ":sample2"
			line += "\n" unless c.nil?
			line
		end
		.join("\0")
	print result
end
